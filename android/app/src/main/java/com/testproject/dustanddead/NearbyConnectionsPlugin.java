package com.testproject.dustanddead;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

@CapacitorPlugin(
    name = "NearbyConnections",
    permissions = {
        @Permission(alias = "coarseLocation", strings = { Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "fineLocation", strings = { Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        ),
        @Permission(alias = "nearbyWifi", strings = { Manifest.permission.NEARBY_WIFI_DEVICES }),
        @Permission(alias = "localNetwork", strings = { "android.permission.ACCESS_LOCAL_NETWORK" })
    }
)
public class NearbyConnectionsPlugin extends Plugin {
    private static final Strategy STRATEGY = Strategy.P2P_STAR;
    private static final String STRATEGY_NAME = "P2P_STAR";
    private static final String DEFAULT_ENDPOINT_NAME = "Dust and Dead";
    private static final int ANDROID_API_17 = 37;
    // Nearby stopAdvertising/stopDiscovery/stopAllEndpoints are fire-and-forget APIs. A short
    // quiet period prevents a following start call from observing the previous radio session.
    private static final long TRANSPORT_SETTLE_MS = 300L;
    private static final long RETRY_SETTLE_MS = 350L;
    private static final long PERMISSION_SETTLE_MS = 1200L;
    private static final long PERMISSION_CLIENT_REFRESH_SETTLE_MS = 1200L;
    private static final long LATEST_PAYLOAD_WATCHDOG_MS = 1000L;
    private static final byte[] PROTOCOL_9_GZIP_MAGIC = new byte[] { 'D', '9', 'G', 'Z' };
    private static final int MAX_INFLATED_PAYLOAD_SIZE = 1024 * 1024;
    private static final String PRECISE_LOCATION_UPGRADE_ATTEMPTED = "__nearbyPreciseLocationUpgradeAttempted";
    private static final String COARSE_LOCATION_RECOVERY_REQUIRED = "__nearbyCoarseLocationRecoveryRequired";
    private static final String FINE_LOCATION_RECOVERY_REQUIRED = "__nearbyFineLocationRecoveryRequired";
    private static final String LOCATION_PERMISSION_GROUP_ATTEMPTED = "__nearbyLocationPermissionGroupAttempted";
    private static final String BLUETOOTH_PERMISSION_GROUP_ATTEMPTED = "__nearbyBluetoothPermissionGroupAttempted";
    private static final String WIFI_PERMISSION_GROUP_ATTEMPTED = "__nearbyWifiPermissionGroupAttempted";
    private static final String LOCAL_NETWORK_PERMISSION_GROUP_ATTEMPTED = "__nearbyLocalNetworkPermissionGroupAttempted";

    private ConnectionsClient connectionsClient;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String serviceId;
    private String localDisplayName = DEFAULT_ENDPOINT_NAME;
    private volatile boolean advertising;
    private volatile boolean discovering;
    private volatile boolean advertisingStartInFlight;
    private volatile boolean discoveryStartInFlight;
    private volatile boolean permissionRequestInFlight;
    private volatile boolean permissionContinuationCanceled;
    private volatile long advertisingGeneration;
    private volatile long discoveryGeneration;
    private volatile long endpointSessionGeneration;
    private volatile long latestOperationId;
    private volatile long activeAdvertisingOperationId;
    private volatile long activeDiscoveryOperationId;
    private volatile long lastTransportStopElapsedRealtime;
    private volatile long lastPermissionGrantElapsedRealtime;

    private final Map<String, String> endpointNames = new ConcurrentHashMap<>();
    private static final class EndpointOwner {
        final long sessionGeneration;
        final long operationId;
        final long connectionNonce;

        EndpointOwner(long sessionGeneration, long operationId, long connectionNonce) {
            this.sessionGeneration = sessionGeneration;
            this.operationId = operationId;
            this.connectionNonce = connectionNonce;
        }
    }

    /**
     * Serializes incoming lifecycle attempts for a shared advertising callback.
     * Nearby terminal callbacks contain only an endpoint id, so once attempts
     * overlap they cannot be attributed safely. The gate quarantines that id,
     * ignores every ambiguous terminal result, and reopens it only after all
     * expected result/disconnect callbacks have drained.
     */
    static final class IncomingLifecycleGate {
        static final class InitiationDecision {
            final boolean accepted;
            final boolean quarantineStarted;

            InitiationDecision(boolean accepted, boolean quarantineStarted) {
                this.accepted = accepted;
                this.quarantineStarted = quarantineStarted;
            }
        }

        static final class ResultDecision {
            final boolean applyToOwner;
            final boolean disconnectSuccessfulAttempt;
            final boolean quarantineDrained;

            ResultDecision(boolean applyToOwner, boolean disconnectSuccessfulAttempt, boolean quarantineDrained) {
                this.applyToOwner = applyToOwner;
                this.disconnectSuccessfulAttempt = disconnectSuccessfulAttempt;
                this.quarantineDrained = quarantineDrained;
            }
        }

        static final class DisconnectDecision {
            final boolean applyToOwner;
            final boolean quarantineDrained;

            DisconnectDecision(boolean applyToOwner, boolean quarantineDrained) {
                this.applyToOwner = applyToOwner;
                this.quarantineDrained = quarantineDrained;
            }
        }

        private static final class State {
            int pendingResults = 1;
            int pendingDisconnects;
            boolean quarantined;
        }

        private final Map<String, State> states = new ConcurrentHashMap<>();

        synchronized InitiationDecision onInitiated(String endpointId) {
            State existing = states.get(endpointId);
            if (existing == null) {
                states.put(endpointId, new State());
                return new InitiationDecision(true, false);
            }
            boolean quarantineStarted = !existing.quarantined;
            existing.quarantined = true;
            existing.pendingResults += 1;
            return new InitiationDecision(false, quarantineStarted);
        }

        synchronized void abortAcceptedInitiation(String endpointId) {
            State state = states.get(endpointId);
            if (state != null && !state.quarantined && state.pendingResults == 1 && state.pendingDisconnects == 0) {
                states.remove(endpointId, state);
            }
        }

        synchronized ResultDecision onConnectionResult(String endpointId, boolean success) {
            State state = states.get(endpointId);
            if (state == null || state.pendingResults <= 0) {
                return new ResultDecision(false, false, false);
            }
            state.pendingResults -= 1;
            if (state.quarantined) {
                if (success) state.pendingDisconnects += 1;
                boolean drained = drainQuarantineIfComplete(endpointId, state);
                return new ResultDecision(false, success, drained);
            }
            if (success) {
                state.pendingDisconnects = 1;
            } else {
                states.remove(endpointId, state);
            }
            return new ResultDecision(true, false, false);
        }

        synchronized DisconnectDecision onDisconnected(String endpointId) {
            State state = states.get(endpointId);
            if (state == null) return new DisconnectDecision(false, false);
            if (state.quarantined) {
                if (state.pendingDisconnects > 0) state.pendingDisconnects -= 1;
                boolean drained = drainQuarantineIfComplete(endpointId, state);
                return new DisconnectDecision(false, drained);
            }
            states.remove(endpointId, state);
            return new DisconnectDecision(true, false);
        }

        synchronized boolean isQuarantined(String endpointId) {
            State state = states.get(endpointId);
            return state != null && state.quarantined;
        }

        private boolean drainQuarantineIfComplete(String endpointId, State state) {
            if (state.pendingResults != 0 || state.pendingDisconnects != 0) return false;
            states.remove(endpointId, state);
            return true;
        }
    }

    private static final class LatestPayloadState {
        long activePayloadId;
        byte[] activeBytes;
        byte[] pendingBytes;
        String latestKind = "snapshot";
        long sessionGeneration;
        long operationId;
        long connectionNonce;
    }

    private static final class LatestIncomingPayloadState {
        long payloadId;
        byte[] bytes;
        int wireSize;
        boolean compressed;
        boolean flushPosted;
        long replacedPayloads;
        long sessionGeneration;
        long operationId;
        long connectionNonce;
    }

    // Realtime world snapshots are replaceable. Keep one transfer plus one newest
    // pending snapshot per endpoint so a slow radio cannot accumulate stale state.
    private final Map<String, LatestPayloadState> latestPayloadStates = new ConcurrentHashMap<>();
    // A completed Nearby transfer can still wait behind rendering work in the
    // Android main looper and then behind Capacitor's WebView bridge. Collapse
    // those already-delivered realtime messages once more before crossing the
    // bridge, otherwise a busy boss frame makes the game replay stale snapshots.
    private final Map<String, LatestIncomingPayloadState> latestIncomingPayloadStates = new ConcurrentHashMap<>();
    private final AtomicLong incomingRealtimePayloads = new AtomicLong();
    private final AtomicLong incomingRealtimeCoalesced = new AtomicLong();
    private final AtomicLong endpointConnectionNonces = new AtomicLong();
    private final Set<String> pendingEndpointIds = ConcurrentHashMap.newKeySet();
    private final Set<String> connectedEndpointIds = ConcurrentHashMap.newKeySet();
    private final Map<String, EndpointOwner> endpointOwners = new ConcurrentHashMap<>();

    @Override
    public void load() {
        connectionsClient = createConnectionsClient();
        serviceId = getContext().getPackageName();
    }

    private ConnectionsClient createConnectionsClient() {
        if (getActivity() != null) {
            return Nearby.getConnectionsClient(getActivity());
        }
        return Nearby.getConnectionsClient(getContext());
    }

    private void refreshConnectionsClient() {
        connectionsClient = createConnectionsClient();
    }

    @PluginMethod
    public void startHost(PluginCall call) {
        startAdvertisingInternal(call);
    }

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        startAdvertisingInternal(call);
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (claimTransportOperationId(call, "startDiscovery") == 0L) {
            return;
        }
        if (!ensureRuntimePermissions(call)) {
            return;
        }
        startDiscoveryWithPermissions(call);
    }

    @PluginMethod
    public void requestConnection(PluginCall call) {
        if (claimTransportOperationId(call, "requestConnection") == 0L) {
            return;
        }
        if (!ensureRuntimePermissions(call)) {
            return;
        }
        requestConnectionWithPermissions(call);
    }

    @PluginMethod
    public void acceptConnection(PluginCall call) {
        if (requireCurrentTransportOperationId(call, "acceptConnection") == 0L) {
            return;
        }
        if (!ensureRuntimePermissions(call)) {
            return;
        }
        acceptConnectionWithPermissions(call);
    }

    @PluginMethod
    public synchronized void rejectConnection(PluginCall call) {
        long operationId = requireCurrentTransportOperationId(call, "rejectConnection");
        if (operationId == 0L) {
            return;
        }
        String endpointId = requiredEndpointId(call);
        if (endpointId == null) {
            return;
        }
        long sessionGeneration = endpointSessionGeneration;
        EndpointOwner owner = currentEndpointOwner(endpointId, sessionGeneration, operationId);
        if (!pendingEndpointIds.contains(endpointId) || owner == null) {
            rejectStaleEndpointOperation(call, "rejectConnection", endpointId, operationId);
            return;
        }
        if (!validateRequiredConnectionNonce(call, "rejectConnection", endpointId, operationId, owner)) {
            return;
        }

        connectionsClient
            .rejectConnection(endpointId)
            .addOnSuccessListener(unused -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentEndpointOwnerOrUnclaimed(endpointId, owner)) {
                        rejectSupersededOperation(call, "rejectConnection", operationId);
                        return;
                    }
                    pendingEndpointIds.remove(endpointId);
                    connectedEndpointIds.remove(endpointId);
                    latestPayloadStates.remove(endpointId);
                    clearLatestIncomingPayloads(endpointId);
                    JSObject result = endpointResult(endpointId, owner);
                    emitState("connectionRejectedLocally", result);
                    releaseEndpointOwner(endpointId, owner);
                    call.resolve(result);
                }
            })
            .addOnFailureListener(error -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentEndpointOwner(endpointId, owner)) {
                        rejectSupersededOperation(call, "rejectConnection", operationId);
                        return;
                    }
                    rejectNearbyCall(call, "rejectConnection", error, operationId);
                }
            });
    }

    @PluginMethod
    public void sendBytes(PluginCall call) {
        long operationId = requireCurrentTransportOperationId(call, "sendBytes");
        if (operationId == 0L) {
            return;
        }
        long sessionGeneration = endpointSessionGeneration;
        String encodedData = call.getString("data");
        if (encodedData == null) {
            call.reject("data is required and must be a base64 string.", "INVALID_ARGUMENT");
            return;
        }

        final byte[] decodedBytes;
        try {
            decodedBytes = Base64.decode(encodedData, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("data is not valid base64.", "INVALID_ARGUMENT", error);
            return;
        }

        final byte[] bytes = maybeCompressProtocolPayload(decodedBytes);
        if (bytes.length > ConnectionsClient.MAX_BYTES_DATA_SIZE) {
            call.reject(
                "Byte payload exceeds the Nearby Connections limit of " + ConnectionsClient.MAX_BYTES_DATA_SIZE +
                    " bytes after compression (raw " + decodedBytes.length + ", wire " + bytes.length + ").",
                "PAYLOAD_TOO_LARGE"
            );
            return;
        }

        sendBytesWithCurrentTargets(call, bytes, sessionGeneration, operationId);
    }

    private synchronized void sendBytesWithCurrentTargets(
        PluginCall call,
        byte[] bytes,
        long sessionGeneration,
        long operationId
    ) {
        if (sessionGeneration != endpointSessionGeneration || operationId != latestOperationId) {
            rejectSupersededOperation(call, "sendBytes", operationId);
            return;
        }
        List<String> targets = resolveSendTargets(call, sessionGeneration, operationId);
        if (targets == null) {
            return;
        }
        if (targets.isEmpty()) {
            call.reject("No connected peers are available.", "NO_CONNECTED_PEERS");
            return;
        }
        Map<String, EndpointOwner> targetOwners = captureEndpointOwners(targets, sessionGeneration, operationId);
        if (targetOwners == null) {
            rejectSupersededOperation(call, "sendBytes", operationId);
            return;
        }
        Long requestedConnectionNonce = bridgeLong(call, "connectionNonce");
        JSArray requestedEndpointIds = call.getArray("endpointIds");
        boolean hasExplicitTargets = normalize(call.getString("endpointId")) != null ||
            (requestedEndpointIds != null && requestedEndpointIds.length() > 0);
        if (requestedConnectionNonce != null) {
            if (targets.size() != 1) {
                call.reject(
                    "connectionNonce can only be used with exactly one target endpoint.",
                    "INVALID_ARGUMENT"
                );
                return;
            }
            String target = targets.get(0);
            if (!validateOptionalConnectionNonce(
                call,
                "sendBytes",
                target,
                operationId,
                targetOwners.get(target)
            )) return;
        } else if (hasExplicitTargets && targets.size() == 1) {
            String target = targets.get(0);
            if (!validateRequiredConnectionNonce(
                call,
                "sendBytes",
                target,
                operationId,
                targetOwners.get(target)
            )) return;
        }

        boolean latestOnly = Boolean.TRUE.equals(call.getBoolean("latestOnly", false));
        if (latestOnly && targets.size() == 1) {
            String latestKind = call.getString("latestKind", "snapshot");
            if (!"input".equals(latestKind)) latestKind = "snapshot";
            queueLatestPayload(
                call,
                targets.get(0),
                bytes,
                latestKind,
                targetOwners.get(targets.get(0)),
                sessionGeneration,
                operationId
            );
            return;
        }

        Payload payload = Payload.fromBytes(bytes);
        ConnectionsClient clientAtStart = connectionsClient;
        clientAtStart
            .sendPayload(targets, payload)
            .addOnSuccessListener(unused -> {
                if (!areCurrentEndpointOwners(targetOwners)) {
                    rejectSupersededOperation(call, "sendBytes", operationId);
                    return;
                }
                JSObject result = new JSObject();
                result.put("payloadId", payload.getId());
                result.put("endpointIds", new JSArray(targets));
                result.put("size", bytes.length);
                result.put("operationId", operationId);
                emitState("payloadQueued", result);
                call.resolve(result);
            })
            .addOnFailureListener(error -> {
                if (!areCurrentEndpointOwners(targetOwners)) {
                    rejectSupersededOperation(call, "sendBytes", operationId);
                    return;
                }
                rejectNearbyCall(call, "sendBytes", error, operationId);
            });
    }

    private void queueLatestPayload(
        PluginCall call,
        String endpointId,
        byte[] bytes,
        String latestKind,
        EndpointOwner owner,
        long sessionGeneration,
        long operationId
    ) {
        if (!isCurrentEndpointOwner(endpointId, owner) ||
            !matchesEndpointOwner(owner, sessionGeneration, operationId)) {
            rejectSupersededOperation(call, "sendBytes", operationId);
            return;
        }
        long connectionNonce = owner.connectionNonce;
        ConnectionsClient clientAtStart = connectionsClient;
        LatestPayloadState state = latestPayloadStates.computeIfAbsent(endpointId, ignored -> new LatestPayloadState());
        synchronized (state) {
            if (state.sessionGeneration != sessionGeneration ||
                state.operationId != operationId ||
                state.connectionNonce != connectionNonce) {
                state.activePayloadId = 0L;
                state.activeBytes = null;
                state.pendingBytes = null;
                state.sessionGeneration = sessionGeneration;
                state.operationId = operationId;
                state.connectionNonce = connectionNonce;
            }
            state.latestKind = latestKind;
            if (state.activePayloadId != 0L) {
                // Protocol 31 snapshots and inputs are cumulative latest-only
                // state. Keep only the newest compressed bytes in O(1) while
                // the active transfer completes.
                state.pendingBytes = coalesceLatestPayloadBytes(state.pendingBytes, bytes);
                JSObject result = endpointResult(endpointId, owner);
                result.put("size", bytes.length);
                result.put("coalesced", true);
                result.put("latestKind", latestKind);
                emitState("payloadCoalesced", result);
                call.resolve(result);
                return;
            }
        }
        sendLatestPayload(
            clientAtStart,
            endpointId,
            bytes,
            state,
            call,
            sessionGeneration,
            operationId,
            connectionNonce
        );
    }

    private void sendLatestPayload(
        ConnectionsClient clientAtStart,
        String endpointId,
        byte[] bytes,
        LatestPayloadState state,
        PluginCall call,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        if (!connectedEndpointIds.contains(endpointId) ||
            !isCurrentEndpointOwner(endpointId, sessionGeneration, operationId, connectionNonce) ||
            !isCurrentLatestPayloadState(endpointId, state, sessionGeneration, operationId, connectionNonce)) {
            if (call != null) rejectSupersededOperation(call, "sendBytes", operationId);
            return;
        }
        Payload payload = Payload.fromBytes(bytes);
        synchronized (state) {
            if (state.sessionGeneration != sessionGeneration ||
                state.operationId != operationId ||
                state.connectionNonce != connectionNonce) {
                if (call != null) rejectSupersededOperation(call, "sendBytes", operationId);
                return;
            }
            state.activePayloadId = payload.getId();
            state.activeBytes = bytes;
        }
        clientAtStart
            .sendPayload(Collections.singletonList(endpointId), payload)
            .addOnSuccessListener(unused -> {
                if (!isCurrentLatestPayloadAttempt(
                    endpointId,
                    state,
                    payload.getId(),
                    sessionGeneration,
                    operationId,
                    connectionNonce
                )) {
                    if (call != null) rejectSupersededOperation(call, "sendBytes", operationId);
                    return;
                }
                JSObject result = endpointResult(endpointId, operationId);
                result.put("connectionNonce", connectionNonce);
                result.put("payloadId", payload.getId());
                result.put("size", bytes.length);
                result.put("latestOnly", true);
                result.put("latestKind", state.latestKind);
                emitState("payloadQueued", result);
                if (call != null) call.resolve(result);
            })
            .addOnFailureListener(error -> {
                if (!isCurrentLatestPayloadAttempt(
                    endpointId,
                    state,
                    payload.getId(),
                    sessionGeneration,
                    operationId,
                    connectionNonce
                )) {
                    if (call != null) rejectSupersededOperation(call, "sendBytes", operationId);
                    return;
                }
                byte[] pending = clearLatestPayload(
                    endpointId,
                    payload.getId(),
                    true,
                    state,
                    sessionGeneration,
                    operationId,
                    connectionNonce
                );
                if (call != null) {
                    rejectNearbyCall(call, "sendBytes", error, operationId);
                } else {
                    JSObject result = endpointResult(endpointId, operationId);
                    result.put("connectionNonce", connectionNonce);
                    result.put("payloadId", payload.getId());
                    result.put("message", error.getMessage());
                    emitState("payloadSendFailed", result);
                }
                if (pending != null) {
                    mainHandler.post(
                        () -> sendLatestPayload(
                            clientAtStart,
                            endpointId,
                            pending,
                            state,
                            null,
                            sessionGeneration,
                            operationId,
                            connectionNonce
                        )
                    );
                }
            });
        mainHandler.postDelayed(() -> {
            byte[] pending;
            synchronized (state) {
                if (!isCurrentLatestPayloadAttemptLocked(
                    endpointId,
                    state,
                    payload.getId(),
                    sessionGeneration,
                    operationId,
                    connectionNonce
                ) || state.pendingBytes == null) return;
                pending = coalesceLatestPayloadBytes(state.activeBytes, state.pendingBytes);
                state.pendingBytes = null;
                state.activePayloadId = 0L;
                state.activeBytes = null;
            }
            clientAtStart.cancelPayload(payload.getId()).addOnFailureListener(error -> { });
            sendLatestPayload(
                clientAtStart,
                endpointId,
                pending,
                state,
                null,
                sessionGeneration,
                operationId,
                connectionNonce
            );
        }, LATEST_PAYLOAD_WATCHDOG_MS);
    }

    private byte[] clearLatestPayload(
        String endpointId,
        long payloadId,
        boolean preserveActiveSnapshotFields,
        LatestPayloadState state,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        if (!isCurrentLatestPayloadState(
            endpointId,
            state,
            sessionGeneration,
            operationId,
            connectionNonce
        )) return null;
        synchronized (state) {
            if (state.sessionGeneration != sessionGeneration ||
                state.operationId != operationId ||
                state.connectionNonce != connectionNonce ||
                state.activePayloadId != payloadId) return null;
            byte[] pending = preserveActiveSnapshotFields
                ? coalesceLatestPayloadBytes(state.activeBytes, state.pendingBytes)
                : state.pendingBytes;
            state.pendingBytes = null;
            state.activePayloadId = 0L;
            state.activeBytes = null;
            return pending;
        }
    }

    private static byte[] maybeCompressProtocolPayload(byte[] bytes) {
        if (bytes == null || bytes.length < 512) return bytes;
        try {
            // Snapshots are created with `type` as the first JSON property.
            // Detect the 15 Hz path from its ASCII prefix instead of building
            // a full JSONObject solely to rediscover the type. Negotiation
            // already rejects pre-v31 peers before gameplay begins.
            boolean snapshot = "snapshot".equals(realtimePayloadKind(bytes));
            if (!snapshot) {
                JSONObject message = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                if (!"matchEnd".equals(message.optString("type")) || !message.has("finalSnapshot") || message.optInt("version", 0) < 9) {
                    return bytes;
                }
            }
            ByteArrayOutputStream compressedBuffer = new ByteArrayOutputStream(Math.max(256, bytes.length / 2));
            compressedBuffer.write(PROTOCOL_9_GZIP_MAGIC);
            try (GZIPOutputStream gzip = new GZIPOutputStream(compressedBuffer)) {
                gzip.write(bytes);
            }
            byte[] compressed = compressedBuffer.toByteArray();
            return compressed.length + 16 < bytes.length ? compressed : bytes;
        } catch (Exception ignored) {
            return bytes;
        }
    }

    private static boolean isProtocol9CompressedPayload(byte[] bytes) {
        if (bytes == null || bytes.length <= PROTOCOL_9_GZIP_MAGIC.length) return false;
        for (int i = 0; i < PROTOCOL_9_GZIP_MAGIC.length; i++) {
            if (bytes[i] != PROTOCOL_9_GZIP_MAGIC[i]) return false;
        }
        return true;
    }

    private static byte[] inflateProtocol9Payload(byte[] bytes) throws IOException {
        if (!isProtocol9CompressedPayload(bytes)) return bytes;
        ByteArrayOutputStream inflated = new ByteArrayOutputStream(Math.min(MAX_INFLATED_PAYLOAD_SIZE, bytes.length * 4));
        try (
            ByteArrayInputStream input = new ByteArrayInputStream(
                bytes,
                PROTOCOL_9_GZIP_MAGIC.length,
                bytes.length - PROTOCOL_9_GZIP_MAGIC.length
            );
            GZIPInputStream gzip = new GZIPInputStream(input)
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = gzip.read(buffer)) != -1) {
                if (inflated.size() + read > MAX_INFLATED_PAYLOAD_SIZE) {
                    throw new IOException("Inflated Nearby payload exceeds the safety limit.");
                }
                inflated.write(buffer, 0, read);
            }
        }
        return inflated.toByteArray();
    }

    static byte[] coalesceLatestPayloadBytes(byte[] olderBytes, byte[] newerBytes) {
        // Every protocol-31 realtime packet is cumulative. Enemy/event/hazard
        // sections independently retain unacknowledged state on the host, so
        // replacing an unsent packet is both correct and O(1), even when the
        // payload is already gzip-compressed binary data.
        if (newerBytes != null && newerBytes.length > 0) return newerBytes;
        return olderBytes;
    }

    @PluginMethod
    public synchronized void disconnect(PluginCall call) {
        long operationId = requireCurrentTransportOperationId(call, "disconnect");
        if (operationId == 0L) {
            return;
        }
        String endpointId = requiredEndpointId(call);
        if (endpointId == null) {
            return;
        }
        long sessionGeneration = endpointSessionGeneration;
        EndpointOwner owner = currentEndpointOwner(endpointId, sessionGeneration, operationId);
        if ((!pendingEndpointIds.contains(endpointId) && !connectedEndpointIds.contains(endpointId)) || owner == null) {
            rejectStaleEndpointOperation(call, "disconnect", endpointId, operationId);
            return;
        }
        if (!validateRequiredConnectionNonce(call, "disconnect", endpointId, operationId, owner)) {
            return;
        }

        connectionsClient.disconnectFromEndpoint(endpointId);
        markTransportStopped();
        pendingEndpointIds.remove(endpointId);
        connectedEndpointIds.remove(endpointId);
        latestPayloadStates.remove(endpointId);
        clearLatestIncomingPayloads(endpointId);
        JSObject result = endpointResult(endpointId, owner);
        emitState("disconnectRequested", result);
        releaseEndpointOwner(endpointId, owner);
        endpointNames.remove(endpointId);
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void stopAdvertising(PluginCall call) {
        long operationId = claimTransportOperationId(call, "stopAdvertising");
        if (operationId == 0L) return;
        advertisingGeneration++;
        activeAdvertisingOperationId = 0L;
        connectionsClient.stopAdvertising();
        advertising = false;
        advertisingStartInFlight = false;
        markTransportStopped();
        JSObject result = operationResult(baseTransportState(), operationId);
        emitState("advertisingStopped", result);
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void stopDiscovery(PluginCall call) {
        long operationId = claimTransportOperationId(call, "stopDiscovery");
        if (operationId == 0L) return;
        discoveryGeneration++;
        activeDiscoveryOperationId = 0L;
        connectionsClient.stopDiscovery();
        discovering = false;
        discoveryStartInFlight = false;
        markTransportStopped();
        endpointNames.keySet().removeIf(endpointId -> !pendingEndpointIds.contains(endpointId) && !connectedEndpointIds.contains(endpointId));
        JSObject result = operationResult(baseTransportState(), operationId);
        emitState("discoveryStopped", result);
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void stopAll(PluginCall call) {
        long operationId = claimTransportOperationId(call, "stopAll");
        if (operationId == 0L) return;
        stopAllInternal();
        JSObject result = operationResult(baseTransportState(), operationId);
        emitState("allStopped", result);
        call.resolve(result);
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject result = baseTransportState();
        result.put("connectedEndpointIds", new JSArray(sortedCopy(connectedEndpointIds)));
        result.put("pendingEndpointIds", new JSArray(sortedCopy(pendingEndpointIds)));
        result.put("maxBytesPayloadSize", ConnectionsClient.MAX_BYTES_DATA_SIZE);
        result.put("diagnostics", buildDiagnostics());
        call.resolve(result);
    }

    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        call.resolve(buildDiagnostics());
    }

    @PluginMethod
    public void requestNearbyPermissions(PluginCall call) {
        if (!ensureRuntimePermissions(call)) {
            return;
        }
        resolveNearbyPermissions(call);
    }

    private void startAdvertisingInternal(PluginCall call) {
        if (claimTransportOperationId(call, "startAdvertising") == 0L) {
            return;
        }
        if (!ensureRuntimePermissions(call)) {
            return;
        }
        startAdvertisingWithPermissions(call);
    }

    @SuppressLint("MissingPermission")
    private void startAdvertisingWithPermissions(PluginCall call) {
        long operationId = requireCurrentTransportOperationId(call, "startAdvertising");
        if (operationId == 0L) {
            return;
        }
        if (advertising) {
            if (activeAdvertisingOperationId != operationId) {
                rejectSupersededOperation(call, "startAdvertising", operationId);
                return;
            }
            JSObject result = operationResult(baseTransportState(), operationId);
            result.put("alreadyActive", true);
            call.resolve(result);
            return;
        }
        if (advertisingStartInFlight) {
            rejectOperationInProgress(call, "startAdvertising");
            return;
        }
        if (!validateEnvironment(call, "startAdvertising")) {
            return;
        }

        String displayName = displayNameFrom(call);
        localDisplayName = displayName;
        advertisingStartInFlight = true;
        activeAdvertisingOperationId = operationId;
        long generation = ++advertisingGeneration;
        long sessionGeneration = endpointSessionGeneration;
        ConnectionsClient clientAtStart = connectionsClient;
        long delayMs = remainingTransportSettleDelay();
        mainHandler.postDelayed(
            () -> attemptStartAdvertising(
                call,
                clientAtStart,
                generation,
                sessionGeneration,
                operationId,
                displayName,
                0
            ),
            delayMs
        );
    }

    @SuppressLint("MissingPermission")
    private void attemptStartAdvertising(
        PluginCall call,
        ConnectionsClient clientAtStart,
        long generation,
        long sessionGeneration,
        long operationId,
        String displayName,
        int retryCount
    ) {
        if (!isCurrentAdvertisingStart(generation, sessionGeneration, operationId)) {
            rejectCanceledStart(call, "startAdvertising");
            return;
        }
        if (!hasAllRequiredPermissions()) {
            advertisingStartInFlight = false;
            clearActiveAdvertisingOperation(operationId);
            rejectMissingPermissions(call, "startAdvertising");
            return;
        }

        AdvertisingOptions options = new AdvertisingOptions.Builder().setStrategy(STRATEGY).build();
        clientAtStart
            .startAdvertising(
                displayName,
                serviceId,
                createConnectionLifecycleCallback(
                    sessionGeneration,
                    operationId,
                    generation,
                    null,
                    clientAtStart
                ),
                options
            )
            .addOnSuccessListener(unused -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentAdvertisingStart(generation, sessionGeneration, operationId)) {
                        // A stale success can arrive after a newer advertising generation has
                        // already started. Stopping unconditionally here would tear down that
                        // newer, valid session.
                        if (!advertisingStartInFlight && !advertising) {
                            clientAtStart.stopAdvertising();
                        }
                        rejectCanceledStart(call, "startAdvertising");
                        return;
                    }
                    advertisingStartInFlight = false;
                    advertising = true;
                    JSObject result = operationResult(baseTransportState(), operationId);
                    emitState("advertisingStarted", result);
                    call.resolve(result);
                }
            })
            .addOnFailureListener(error -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentAdvertisingStart(generation, sessionGeneration, operationId)) {
                        rejectCanceledStart(call, "startAdvertising");
                        return;
                    }
                    int statusCode = apiStatusCode(error);
                    if (retryCount == 0 && shouldRefreshClientForPermissionMismatch(statusCode)) {
                        long retrySessionGeneration = invalidateEndpointSessionState();
                        refreshConnectionsClient();
                        ConnectionsClient retryClient = connectionsClient;
                        mainHandler.postDelayed(
                            () -> attemptStartAdvertising(
                                call,
                                retryClient,
                                generation,
                                retrySessionGeneration,
                                operationId,
                                displayName,
                                1
                            ),
                            PERMISSION_CLIENT_REFRESH_SETTLE_MS
                        );
                        return;
                    }
                    if (requestMissingRuntimePermissionRecovery(call, statusCode)) {
                        advertisingStartInFlight = false;
                        advertising = false;
                        clearActiveAdvertisingOperation(operationId);
                        return;
                    }
                    if (retryCount == 0 && canRetryAdvertising(statusCode)) {
                        long retrySessionGeneration = prepareAdvertisingRetry(clientAtStart, statusCode);
                        mainHandler.postDelayed(
                            () -> attemptStartAdvertising(
                                call,
                                clientAtStart,
                                generation,
                                retrySessionGeneration,
                                operationId,
                                displayName,
                                1
                            ),
                            RETRY_SETTLE_MS
                        );
                        return;
                    }
                    advertisingStartInFlight = false;
                    advertising = false;
                    clearActiveAdvertisingOperation(operationId);
                    rejectNearbyCall(call, "startAdvertising", error, operationId);
                }
            });
    }

    @SuppressLint("MissingPermission")
    private void startDiscoveryWithPermissions(PluginCall call) {
        long operationId = requireCurrentTransportOperationId(call, "startDiscovery");
        if (operationId == 0L) {
            return;
        }
        if (discovering) {
            if (activeDiscoveryOperationId != operationId) {
                rejectSupersededOperation(call, "startDiscovery", operationId);
                return;
            }
            JSObject result = operationResult(baseTransportState(), operationId);
            result.put("alreadyActive", true);
            call.resolve(result);
            return;
        }
        if (discoveryStartInFlight) {
            rejectOperationInProgress(call, "startDiscovery");
            return;
        }
        if (!validateEnvironment(call, "startDiscovery")) {
            return;
        }

        discoveryStartInFlight = true;
        activeDiscoveryOperationId = operationId;
        long generation = ++discoveryGeneration;
        long sessionGeneration = endpointSessionGeneration;
        ConnectionsClient clientAtStart = connectionsClient;
        long delayMs = remainingTransportSettleDelay();
        mainHandler.postDelayed(
            () -> attemptStartDiscovery(call, clientAtStart, generation, sessionGeneration, operationId, 0),
            delayMs
        );
    }

    @SuppressLint("MissingPermission")
    private void attemptStartDiscovery(
        PluginCall call,
        ConnectionsClient clientAtStart,
        long generation,
        long sessionGeneration,
        long operationId,
        int retryCount
    ) {
        if (!isCurrentDiscoveryStart(generation, sessionGeneration, operationId)) {
            rejectCanceledStart(call, "startDiscovery");
            return;
        }
        if (!hasAllRequiredPermissions()) {
            discoveryStartInFlight = false;
            clearActiveDiscoveryOperation(operationId);
            rejectMissingPermissions(call, "startDiscovery");
            return;
        }

        DiscoveryOptions options = new DiscoveryOptions.Builder().setStrategy(STRATEGY).build();
        clientAtStart
            .startDiscovery(
                serviceId,
                createEndpointDiscoveryCallback(sessionGeneration, generation, operationId),
                options
            )
            .addOnSuccessListener(unused -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentDiscoveryStart(generation, sessionGeneration, operationId)) {
                        // Do not let a callback from an older generation stop a newer,
                        // successful discovery session.
                        if (!discoveryStartInFlight && !discovering) {
                            clientAtStart.stopDiscovery();
                        }
                        rejectCanceledStart(call, "startDiscovery");
                        return;
                    }
                    discoveryStartInFlight = false;
                    discovering = true;
                    JSObject result = operationResult(baseTransportState(), operationId);
                    emitState("discoveryStarted", result);
                    call.resolve(result);
                }
            })
            .addOnFailureListener(error -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentDiscoveryStart(generation, sessionGeneration, operationId)) {
                        rejectCanceledStart(call, "startDiscovery");
                        return;
                    }
                    int statusCode = apiStatusCode(error);
                    if (retryCount == 0 && shouldRefreshClientForPermissionMismatch(statusCode)) {
                        long retrySessionGeneration = invalidateEndpointSessionState();
                        refreshConnectionsClient();
                        ConnectionsClient retryClient = connectionsClient;
                        mainHandler.postDelayed(
                            () -> attemptStartDiscovery(
                                call,
                                retryClient,
                                generation,
                                retrySessionGeneration,
                                operationId,
                                1
                            ),
                            PERMISSION_CLIENT_REFRESH_SETTLE_MS
                        );
                        return;
                    }
                    if (requestMissingRuntimePermissionRecovery(call, statusCode)) {
                        discoveryStartInFlight = false;
                        discovering = false;
                        clearActiveDiscoveryOperation(operationId);
                        return;
                    }
                    if (retryCount == 0 && canRetryDiscovery(statusCode)) {
                        long retrySessionGeneration = prepareDiscoveryRetry(clientAtStart, statusCode);
                        mainHandler.postDelayed(
                            () -> attemptStartDiscovery(
                                call,
                                clientAtStart,
                                generation,
                                retrySessionGeneration,
                                operationId,
                                1
                            ),
                            RETRY_SETTLE_MS
                        );
                        return;
                    }
                    discoveryStartInFlight = false;
                    discovering = false;
                    clearActiveDiscoveryOperation(operationId);
                    rejectNearbyCall(call, "startDiscovery", error, operationId);
                }
            });
    }

    @SuppressLint("MissingPermission")
    private synchronized void requestConnectionWithPermissions(PluginCall call) {
        long operationId = requireCurrentTransportOperationId(call, "requestConnection");
        if (operationId == 0L) {
            return;
        }
        String endpointId = requiredEndpointId(call);
        if (endpointId == null) {
            return;
        }
        long sessionGeneration = endpointSessionGeneration;
        String displayName = displayNameFrom(call);
        attemptRequestConnection(
            call,
            endpointId,
            displayName,
            sessionGeneration,
            operationId
        );
    }

    @SuppressLint("MissingPermission")
    private synchronized void attemptRequestConnection(
        PluginCall call,
        String endpointId,
        String displayName,
        long sessionGeneration,
        long operationId
    ) {
        if (sessionGeneration != endpointSessionGeneration || operationId != latestOperationId) {
            rejectSupersededOperation(call, "requestConnection", operationId);
            return;
        }
        long delayMs = remainingTransportSettleDelay();
        if (delayMs > 0L) {
            boolean scheduled = mainHandler.postDelayed(
                () -> attemptRequestConnection(
                    call,
                    endpointId,
                    displayName,
                    sessionGeneration,
                    operationId
                ),
                delayMs
            );
            if (!scheduled) rejectCanceledStart(call, "requestConnection");
            return;
        }
        if (pendingEndpointIds.contains(endpointId) || connectedEndpointIds.contains(endpointId)) {
            call.reject("The endpoint already has an active or pending connection.", "ENDPOINT_IN_USE");
            return;
        }
        EndpointOwner owner = claimNewEndpointOwner(endpointId, sessionGeneration, operationId);
        if (owner == null) {
            rejectStaleEndpointOperation(call, "requestConnection", endpointId, operationId);
            return;
        }

        localDisplayName = displayName;
        ConnectionsClient clientAtConnection = connectionsClient;
        clientAtConnection
            .requestConnection(
                displayName,
                endpointId,
                createConnectionLifecycleCallback(sessionGeneration, operationId, 0L, owner, clientAtConnection)
            )
            .addOnSuccessListener(unused -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentEndpointOwner(endpointId, owner)) {
                        rejectSupersededOperation(call, "requestConnection", operationId);
                        return;
                    }
                    JSObject result = endpointResult(endpointId, owner);
                    emitState("connectionRequestSent", result);
                    call.resolve(result);
                }
            })
            .addOnFailureListener(error -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentEndpointOwner(endpointId, owner)) {
                        rejectSupersededOperation(call, "requestConnection", operationId);
                        return;
                    }
                    pendingEndpointIds.remove(endpointId);
                    releaseEndpointOwner(endpointId, owner);
                    rejectNearbyCall(call, "requestConnection", error, operationId);
                }
            });
    }

    @SuppressLint("MissingPermission")
    private synchronized void acceptConnectionWithPermissions(PluginCall call) {
        long operationId = requireCurrentTransportOperationId(call, "acceptConnection");
        if (operationId == 0L) {
            return;
        }
        String endpointId = requiredEndpointId(call);
        if (endpointId == null) {
            return;
        }
        if (!pendingEndpointIds.contains(endpointId)) {
            call.reject("No pending authenticated connection exists for endpointId.", "NO_PENDING_CONNECTION");
            return;
        }
        long sessionGeneration = endpointSessionGeneration;
        EndpointOwner owner = currentEndpointOwner(endpointId, sessionGeneration, operationId);
        if (owner == null) {
            rejectStaleEndpointOperation(call, "acceptConnection", endpointId, operationId);
            return;
        }
        if (!validateRequiredConnectionNonce(call, "acceptConnection", endpointId, operationId, owner)) {
            return;
        }
        ConnectionsClient clientAtConnection = connectionsClient;

        clientAtConnection
            .acceptConnection(endpointId, createPayloadCallback(owner, clientAtConnection))
            .addOnSuccessListener(unused -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentEndpointOwner(endpointId, owner)) {
                        rejectSupersededOperation(call, "acceptConnection", operationId);
                        return;
                    }
                    JSObject result = endpointResult(endpointId, owner);
                    emitState("connectionAcceptedLocally", result);
                    call.resolve(result);
                }
            })
            .addOnFailureListener(error -> {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (!isCurrentEndpointOwner(endpointId, owner)) {
                        rejectSupersededOperation(call, "acceptConnection", operationId);
                        return;
                    }
                    rejectNearbyCall(call, "acceptConnection", error, operationId);
                }
            });
    }

    private EndpointDiscoveryCallback createEndpointDiscoveryCallback(
        long sessionGeneration,
        long generation,
        long operationId
    ) {
        return new EndpointDiscoveryCallback() {
            @Override
            public void onEndpointFound(@NonNull String endpointId, @NonNull DiscoveredEndpointInfo info) {
                if (!isCurrentDiscoveryStart(generation, sessionGeneration, operationId)) return;
                endpointNames.put(endpointId, info.getEndpointName());
                JSObject event = endpointResult(endpointId, operationId);
                event.put("event", "found");
                event.put("serviceId", info.getServiceId());
                notifyListeners("peer", event);
            }

            @Override
            public void onEndpointLost(@NonNull String endpointId) {
                if (!isCurrentDiscoveryStart(generation, sessionGeneration, operationId)) return;
                JSObject event = endpointResult(endpointId, operationId);
                event.put("event", "lost");
                event.put("serviceId", serviceId);
                notifyListeners("peer", event);
                if (!pendingEndpointIds.contains(endpointId) && !connectedEndpointIds.contains(endpointId)) {
                    endpointNames.remove(endpointId);
                }
            }
        };
    }

    private ConnectionLifecycleCallback createConnectionLifecycleCallback(
        long sessionGeneration,
        long operationId,
        long incomingAdvertisingGeneration,
        EndpointOwner outboundOwner,
        ConnectionsClient callbackClient
    ) {
        return new ConnectionLifecycleCallback() {
            // requestConnection creates a callback per attempt, so outbound
            // terminal events can bind directly to its immutable owner. Only
            // advertising shares a callback across incoming attempts.
            private final IncomingLifecycleGate incomingGate = outboundOwner == null
                ? new IncomingLifecycleGate()
                : null;
            private final Map<String, EndpointOwner> incomingOwners = new ConcurrentHashMap<>();
            private boolean outboundInitiated;

            private void retireIncomingOwnerForQuarantine(String endpointId) {
                EndpointOwner owner = incomingOwners.remove(endpointId);
                if (owner == null || !isCurrentEndpointOwner(endpointId, owner)) return;
                boolean wasConnected = connectedEndpointIds.contains(endpointId);
                pendingEndpointIds.remove(endpointId);
                connectedEndpointIds.remove(endpointId);
                latestPayloadStates.remove(endpointId);
                clearLatestIncomingPayloads(endpointId);
                JSObject event = endpointResult(endpointId, owner);
                event.put("reason", "overlappingConnectionAttempt");
                emitState(wasConnected ? "disconnected" : "connectionFailed", event);
                releaseEndpointOwner(endpointId, owner);
                endpointNames.remove(endpointId);
                if (wasConnected) callbackClient.disconnectFromEndpoint(endpointId);
            }

            private void applyConnectionResult(
                String endpointId,
                ConnectionResolution resolution,
                EndpointOwner owner
            ) {
                if (!isCurrentEndpointOwner(endpointId, owner)) return;
                int statusCode = resolution.getStatus().getStatusCode();
                pendingEndpointIds.remove(endpointId);

                JSObject event = endpointResult(endpointId, owner);
                event.put("statusCode", statusCode);
                event.put("statusMessage", ConnectionsStatusCodes.getStatusCodeString(statusCode));

                if (statusCode == ConnectionsStatusCodes.STATUS_OK) {
                    connectedEndpointIds.add(endpointId);
                    emitState("connected", event);
                    return;
                }

                connectedEndpointIds.remove(endpointId);
                latestPayloadStates.remove(endpointId);
                clearLatestIncomingPayloads(endpointId);
                if (statusCode == ConnectionsStatusCodes.STATUS_CONNECTION_REJECTED) {
                    emitState("connectionRejected", event);
                } else {
                    emitState("connectionFailed", event);
                }
                releaseEndpointOwner(endpointId, owner);
            }

            private void applyDisconnected(String endpointId, EndpointOwner owner) {
                if (!isCurrentEndpointOwner(endpointId, owner)) return;
                pendingEndpointIds.remove(endpointId);
                connectedEndpointIds.remove(endpointId);
                latestPayloadStates.remove(endpointId);
                clearLatestIncomingPayloads(endpointId);
                JSObject event = endpointResult(endpointId, owner);
                emitState("disconnected", event);
                releaseEndpointOwner(endpointId, owner);
                endpointNames.remove(endpointId);
            }

            @Override
            public void onConnectionInitiated(@NonNull String endpointId, @NonNull ConnectionInfo info) {
                synchronized (NearbyConnectionsPlugin.this) {
                    EndpointOwner owner;
                    if (outboundOwner == null) {
                        if (!isCurrentIncomingLifecycle(
                            incomingAdvertisingGeneration,
                            sessionGeneration,
                            operationId
                        )) return;
                        IncomingLifecycleGate.InitiationDecision decision = incomingGate.onInitiated(endpointId);
                        if (!decision.accepted) {
                            if (decision.quarantineStarted) retireIncomingOwnerForQuarantine(endpointId);
                            callbackClient.rejectConnection(endpointId).addOnFailureListener(error -> { });
                            return;
                        }
                        owner = claimIncomingEndpointOwner(endpointId, sessionGeneration, operationId);
                        if (owner == null) {
                            incomingGate.abortAcceptedInitiation(endpointId);
                            callbackClient.rejectConnection(endpointId).addOnFailureListener(error -> { });
                            return;
                        }
                        incomingOwners.put(endpointId, owner);
                    } else {
                        owner = outboundOwner;
                        if (outboundInitiated || !isCurrentEndpointOwner(endpointId, owner)) return;
                        outboundInitiated = true;
                    }

                    endpointNames.put(endpointId, info.getEndpointName());
                    pendingEndpointIds.add(endpointId);

                    String authenticationDigits = info.getAuthenticationDigits();
                    JSObject event = endpointResult(endpointId, owner);
                    event.put("authenticationToken", authenticationDigits);
                    event.put("authenticationDigits", authenticationDigits);
                    event.put("isIncomingConnection", info.isIncomingConnection());
                    emitState("authenticationRequired", event);
                }
            }

            @Override
            public void onConnectionResult(@NonNull String endpointId, @NonNull ConnectionResolution resolution) {
                synchronized (NearbyConnectionsPlugin.this) {
                    int statusCode = resolution.getStatus().getStatusCode();
                    if (outboundOwner != null) {
                        applyConnectionResult(endpointId, resolution, outboundOwner);
                        return;
                    }
                    IncomingLifecycleGate.ResultDecision decision = incomingGate.onConnectionResult(
                        endpointId,
                        statusCode == ConnectionsStatusCodes.STATUS_OK
                    );
                    // Always drain this callback's private gate. A quarantined result
                    // from an expired advertising generation may never touch the
                    // shared Nearby endpoint identified only by endpointId.
                    boolean currentIncomingLifecycle = isCurrentIncomingLifecycle(
                        incomingAdvertisingGeneration,
                        sessionGeneration,
                        operationId
                    );
                    if (decision.disconnectSuccessfulAttempt) {
                        if (!currentIncomingLifecycle) return;
                        callbackClient.disconnectFromEndpoint(endpointId);
                    }
                    if (!decision.applyToOwner) return;
                    EndpointOwner owner = incomingOwners.get(endpointId);
                    // stopAdvertising is used when a match starts and intentionally
                    // preserves accepted peers. A terminal result already bound to
                    // the exact owner must still complete that peer's state, while
                    // an old callback may never act on a replacement owner.
                    if (!currentIncomingLifecycle && !isCurrentEndpointOwner(endpointId, owner)) return;
                    applyConnectionResult(endpointId, resolution, owner);
                    if (statusCode != ConnectionsStatusCodes.STATUS_OK) {
                        incomingOwners.remove(endpointId, owner);
                    }
                }
            }

            @Override
            public void onDisconnected(@NonNull String endpointId) {
                synchronized (NearbyConnectionsPlugin.this) {
                    if (outboundOwner != null) {
                        applyDisconnected(endpointId, outboundOwner);
                        return;
                    }
                    IncomingLifecycleGate.DisconnectDecision decision = incomingGate.onDisconnected(endpointId);
                    if (!decision.applyToOwner) return;
                    EndpointOwner owner = incomingOwners.get(endpointId);
                    // Advertising is intentionally stopped once a match starts while
                    // accepted peers remain connected. Permit that peer's exact owner
                    // to retire, but never let an old callback mutate a replacement
                    // owner that happens to reuse the same endpoint id.
                    if (!isCurrentIncomingLifecycle(
                            incomingAdvertisingGeneration,
                            sessionGeneration,
                            operationId
                        ) && !isCurrentEndpointOwner(endpointId, owner)) return;
                    if (owner != null) incomingOwners.remove(endpointId, owner);
                    applyDisconnected(endpointId, owner);
                }
            }
        };
    }

    private PayloadCallback createPayloadCallback(EndpointOwner owner, ConnectionsClient clientAtConnection) {
        long sessionGeneration = owner.sessionGeneration;
        long operationId = owner.operationId;
        return new PayloadCallback() {
            @Override
            public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
                if (!isCurrentEndpointOwner(endpointId, owner)) return;
                if (payload.getType() != Payload.Type.BYTES) {
                    JSObject event = endpointResult(endpointId, owner);
                    event.put("payloadId", payload.getId());
                    event.put("message", "Only byte payloads are supported.");
                    emitState("unsupportedPayload", event);
                    return;
                }

                byte[] wireBytes = payload.asBytes();
                if (wireBytes == null) {
                    return;
                }
                byte[] bytes;
                try {
                    bytes = inflateProtocol9Payload(wireBytes);
                } catch (IOException error) {
                    JSObject invalid = endpointResult(endpointId, owner);
                    invalid.put("payloadId", payload.getId());
                    invalid.put("message", error.getMessage());
                    emitState("invalidCompressedPayload", invalid);
                    return;
                }
                String latestKind = realtimePayloadKind(bytes);
                if (latestKind != null) {
                    queueLatestIncomingPayload(
                        endpointId,
                        payload.getId(),
                        bytes,
                        wireBytes.length,
                        wireBytes.length != bytes.length,
                        latestKind,
                        sessionGeneration,
                        operationId,
                        owner.connectionNonce
                    );
                    return;
                }
                emitIncomingPayload(
                    endpointId,
                    payload.getId(),
                    bytes,
                    wireBytes.length,
                    wireBytes.length != bytes.length,
                    null,
                    0L,
                    sessionGeneration,
                    operationId,
                    owner.connectionNonce
                );
            }

            @Override
            public void onPayloadTransferUpdate(@NonNull String endpointId, @NonNull PayloadTransferUpdate update) {
                if (!isCurrentEndpointOwner(endpointId, owner)) return;
                if (update.getStatus() == PayloadTransferUpdate.Status.SUCCESS ||
                    update.getStatus() == PayloadTransferUpdate.Status.FAILURE ||
                    update.getStatus() == PayloadTransferUpdate.Status.CANCELED) {
                    LatestPayloadState latestState = latestPayloadStates.get(endpointId);
                    byte[] pending = clearLatestPayload(
                        endpointId,
                        update.getPayloadId(),
                        update.getStatus() != PayloadTransferUpdate.Status.SUCCESS,
                        latestState,
                        sessionGeneration,
                        operationId,
                        owner.connectionNonce
                    );
                    if (pending != null && latestState != null) {
                        mainHandler.post(
                            () -> sendLatestPayload(
                                clientAtConnection,
                                endpointId,
                                pending,
                                latestState,
                                null,
                                sessionGeneration,
                                operationId,
                                owner.connectionNonce
                            )
                        );
                    }
                }
                JSObject event = endpointResult(endpointId, owner);
                event.put("payloadId", update.getPayloadId());
                event.put("status", payloadStatusName(update.getStatus()));
                event.put("statusCode", update.getStatus());
                event.put("bytesTransferred", update.getBytesTransferred());
                event.put("totalBytes", update.getTotalBytes());
                emitState("payloadTransfer", event);
            }
        };
    }

    static String realtimePayloadKind(byte[] bytes) {
        // sendMultiplayerProtocol serializes a newly-created object whose first
        // property is always `type`. Matching the small ASCII prefix avoids a
        // second full JSON parse on Android for every 31 KiB world snapshot.
        if (startsWithAscii(bytes, "{\"type\":\"snapshot\"")) return "snapshot";
        if (startsWithAscii(bytes, "{\"type\":\"input\"")) return "input";
        return null;
    }

    private static boolean startsWithAscii(byte[] bytes, String prefix) {
        if (bytes == null || prefix == null || bytes.length < prefix.length()) return false;
        for (int index = 0; index < prefix.length(); index++) {
            if ((bytes[index] & 0xff) != prefix.charAt(index)) return false;
        }
        return true;
    }

    private void queueLatestIncomingPayload(
        String endpointId,
        long payloadId,
        byte[] bytes,
        int wireSize,
        boolean compressed,
        String latestKind,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        if (!isCurrentEndpointOwner(endpointId, sessionGeneration, operationId, connectionNonce)) return;
        incomingRealtimePayloads.incrementAndGet();
        String key = incomingPayloadKey(endpointId, latestKind);
        LatestIncomingPayloadState state = latestIncomingPayloadStates.computeIfAbsent(
            key,
            ignored -> new LatestIncomingPayloadState()
        );
        synchronized (state) {
            if (state.sessionGeneration != sessionGeneration ||
                state.operationId != operationId ||
                state.connectionNonce != connectionNonce) {
                state.bytes = null;
                state.replacedPayloads = 0L;
                state.flushPosted = false;
                state.sessionGeneration = sessionGeneration;
                state.operationId = operationId;
                state.connectionNonce = connectionNonce;
            }
            if (state.bytes != null) {
                state.replacedPayloads += 1L;
                incomingRealtimeCoalesced.incrementAndGet();
            }
            state.payloadId = payloadId;
            state.bytes = bytes;
            state.wireSize = wireSize;
            state.compressed = compressed;
            if (state.flushPosted) return;
            state.flushPosted = true;
        }
        mainHandler.post(
            () -> flushLatestIncomingPayload(
                endpointId,
                latestKind,
                state,
                sessionGeneration,
                operationId,
                connectionNonce
            )
        );
    }

    private void flushLatestIncomingPayload(
        String endpointId,
        String latestKind,
        LatestIncomingPayloadState state,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        if (!isCurrentIncomingPayloadState(
            endpointId,
            latestKind,
            state,
            sessionGeneration,
            operationId,
            connectionNonce
        )) return;
        long payloadId;
        byte[] bytes;
        int wireSize;
        boolean compressed;
        long replacedPayloads;
        synchronized (state) {
            if (state.sessionGeneration != sessionGeneration ||
                state.operationId != operationId ||
                state.connectionNonce != connectionNonce) return;
            payloadId = state.payloadId;
            bytes = state.bytes;
            wireSize = state.wireSize;
            compressed = state.compressed;
            replacedPayloads = state.replacedPayloads;
            state.bytes = null;
            state.replacedPayloads = 0L;
            state.flushPosted = false;
        }
        if (bytes == null || !connectedEndpointIds.contains(endpointId) ||
            !isCurrentIncomingPayloadState(
                endpointId,
                latestKind,
                state,
                sessionGeneration,
                operationId,
                connectionNonce
            )) return;
        emitIncomingPayload(
            endpointId,
            payloadId,
            bytes,
            wireSize,
            compressed,
            latestKind,
            replacedPayloads,
            sessionGeneration,
            operationId,
            connectionNonce
        );
        synchronized (state) {
            if (state.sessionGeneration != sessionGeneration ||
                state.operationId != operationId ||
                state.connectionNonce != connectionNonce ||
                state.bytes == null ||
                state.flushPosted) return;
            state.flushPosted = true;
        }
        mainHandler.post(
            () -> flushLatestIncomingPayload(
                endpointId,
                latestKind,
                state,
                sessionGeneration,
                operationId,
                connectionNonce
            )
        );
    }

    private void emitIncomingPayload(
        String endpointId,
        long payloadId,
        byte[] bytes,
        int wireSize,
        boolean compressed,
        String latestKind,
        long coalescedCount,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        if (!isCurrentEndpointOwner(endpointId, sessionGeneration, operationId, connectionNonce)) return;
        JSObject event = endpointResult(endpointId, operationId);
        event.put("connectionNonce", connectionNonce);
        event.put("payloadId", payloadId);
        event.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
        event.put("size", bytes.length);
        event.put("wireSize", wireSize);
        event.put("compressed", compressed);
        if (latestKind != null) {
            event.put("latestKind", latestKind);
            event.put("coalescedCount", coalescedCount);
        }
        notifyListeners("message", event);
    }

    private void clearLatestIncomingPayloads(String endpointId) {
        if (endpointId == null) return;
        String prefix = endpointId + "\u0000";
        for (Map.Entry<String, LatestIncomingPayloadState> entry : latestIncomingPayloadStates.entrySet()) {
            if (!entry.getKey().startsWith(prefix)) continue;
            LatestIncomingPayloadState state = entry.getValue();
            synchronized (state) {
                state.bytes = null;
                state.replacedPayloads = 0L;
                state.flushPosted = false;
                state.sessionGeneration = 0L;
                state.operationId = 0L;
                state.connectionNonce = 0L;
            }
            latestIncomingPayloadStates.remove(entry.getKey(), state);
        }
    }

    private boolean ensureRuntimePermissions(PluginCall call) {
        List<String> requiredAliases = requiredPermissionAliases();
        List<String> missingAliases = new ArrayList<>();
        for (String alias : requiredAliases) {
            if (getPermissionState(alias) != PermissionState.GRANTED) {
                missingAliases.add(alias);
            }
        }

        if (missingAliases.isEmpty()) {
            return true;
        }
        if (permissionRequestInFlight) {
            JSObject data = new JSObject();
            data.put("reason", "permissionRequestInProgress");
            data.put("requiredPermissions", new JSArray(requiredPermissionNames()));
            data.put("diagnostics", buildDiagnostics());
            call.reject(
                "A Nearby permission request is already open. Finish the system dialog and try again.",
                "PERMISSION_REQUEST_IN_PROGRESS",
                data
            );
            return false;
        }
        if (!requestNextMissingPermissionGroup(call)) {
            rejectMissingPermissions(call, call.getMethodName());
        }
        return false;
    }

    private boolean requestNextMissingPermissionGroup(PluginCall call) {
        List<String> requiredAliases = requiredPermissionAliasesForCall(call);
        boolean coarseMissing = requiredAliases.contains("coarseLocation") && getPermissionState("coarseLocation") != PermissionState.GRANTED;
        boolean fineMissing = requiredAliases.contains("fineLocation") && getPermissionState("fineLocation") != PermissionState.GRANTED;
        if (coarseMissing || fineMissing) {
            if (call.getData().optBoolean(LOCATION_PERMISSION_GROUP_ATTEMPTED, false)) return false;
            call.getData().put(LOCATION_PERMISSION_GROUP_ATTEMPTED, true);
            List<String> locationAliases = new ArrayList<>();
            // Android 12 requires coarse and fine to be requested together when
            // precise location is needed. A coarse-only recovery must remain
            // coarse-only; it should never trigger the precision selector.
            if (fineMissing || requiredAliases.contains("fineLocation")) {
                locationAliases.add("coarseLocation");
                locationAliases.add("fineLocation");
            } else {
                locationAliases.add("coarseLocation");
            }
            return requestPermissionGroup(call, locationAliases.toArray(new String[0]));
        }

        if (requiredAliases.contains("bluetooth") && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            if (call.getData().optBoolean(BLUETOOTH_PERMISSION_GROUP_ATTEMPTED, false)) return false;
            call.getData().put(BLUETOOTH_PERMISSION_GROUP_ATTEMPTED, true);
            return requestPermissionGroup(call, new String[] { "bluetooth" });
        }

        if (requiredAliases.contains("nearbyWifi") && getPermissionState("nearbyWifi") != PermissionState.GRANTED) {
            if (call.getData().optBoolean(WIFI_PERMISSION_GROUP_ATTEMPTED, false)) return false;
            call.getData().put(WIFI_PERMISSION_GROUP_ATTEMPTED, true);
            return requestPermissionGroup(call, new String[] { "nearbyWifi" });
        }

        if (requiredAliases.contains("localNetwork") && getPermissionState("localNetwork") != PermissionState.GRANTED) {
            if (call.getData().optBoolean(LOCAL_NETWORK_PERMISSION_GROUP_ATTEMPTED, false)) return false;
            call.getData().put(LOCAL_NETWORK_PERMISSION_GROUP_ATTEMPTED, true);
            return requestPermissionGroup(call, new String[] { "localNetwork" });
        }
        return false;
    }

    private boolean requestPermissionGroup(PluginCall call, String[] aliases) {
        permissionContinuationCanceled = false;
        permissionRequestInFlight = true;
        requestPermissionForAliases(aliases, call, "nearbyPermissionsCallback");
        return true;
    }

    private boolean requestMissingRuntimePermissionRecovery(PluginCall call, int statusCode) {
        String alias = runtimePermissionAliasForStatus(statusCode);
        if (alias == null || call.getData().optBoolean("__nearbyPermissionRecoveryAttempted", false)) {
            return false;
        }
        if (permissionRequestInFlight) {
            return false;
        }
        if (isPermissionGrantedForStatus(statusCode)) {
            return false;
        }

        boolean coarseLocationRecovery = statusCode == ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_COARSE_LOCATION;
        boolean fineLocationRecovery = statusCode == ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_FINE_LOCATION;

        // Android 13+ replaced location access for Nearby Wi-Fi with the
        // NEARBY_WIFI_DEVICES permission. A legacy 8034/8036 result on these
        // versions is a stale Play Services/client state, not a reason to ask
        // the player for location.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            (coarseLocationRecovery || fineLocationRecovery)) {
            return false;
        }

        call.getData().put("__nearbyPermissionRecoveryAttempted", true);
        if (coarseLocationRecovery || fineLocationRecovery) {
            call.getData().put(COARSE_LOCATION_RECOVERY_REQUIRED, true);
            if (fineLocationRecovery) {
                call.getData().put(FINE_LOCATION_RECOVERY_REQUIRED, true);
            }
            call.getData().put(LOCATION_PERMISSION_GROUP_ATTEMPTED, true);
        } else if ("bluetooth".equals(alias)) {
            call.getData().put(BLUETOOTH_PERMISSION_GROUP_ATTEMPTED, true);
        } else if ("nearbyWifi".equals(alias)) {
            call.getData().put(WIFI_PERMISSION_GROUP_ATTEMPTED, true);
        }
        permissionContinuationCanceled = false;
        permissionRequestInFlight = true;
        requestPermissionForAliases(
            fineLocationRecovery
                ? new String[] { "coarseLocation", "fineLocation" }
                : coarseLocationRecovery
                    ? new String[] { "coarseLocation" }
                : new String[] { alias },
            call,
            "nearbyPermissionsCallback"
        );
        return true;
    }

    private boolean shouldRefreshClientForPermissionMismatch(int statusCode) {
        if (advertising || discovering || !connectedEndpointIds.isEmpty() || !pendingEndpointIds.isEmpty()) {
            return false;
        }
        boolean legacyLocationStatus = statusCode == ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_COARSE_LOCATION ||
            statusCode == ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_FINE_LOCATION;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && legacyLocationStatus) {
            return true;
        }
        return isPermissionGrantedForStatus(statusCode);
    }

    private boolean isPermissionGrantedForStatus(int statusCode) {
        String permission;
        switch (statusCode) {
            case ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_COARSE_LOCATION:
                permission = Manifest.permission.ACCESS_COARSE_LOCATION;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_FINE_LOCATION:
                permission = Manifest.permission.ACCESS_FINE_LOCATION;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_WIFI_STATE:
                permission = Manifest.permission.ACCESS_WIFI_STATE;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_CHANGE_WIFI_STATE:
                permission = Manifest.permission.CHANGE_WIFI_STATE;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH:
                permission = Manifest.permission.BLUETOOTH;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_ADMIN:
                permission = Manifest.permission.BLUETOOTH_ADMIN;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_ADVERTISE:
                permission = Manifest.permission.BLUETOOTH_ADVERTISE;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_CONNECT:
                permission = Manifest.permission.BLUETOOTH_CONNECT;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_SCAN:
                permission = Manifest.permission.BLUETOOTH_SCAN;
                break;
            case ConnectionsStatusCodes.MISSING_PERMISSION_NEARBY_WIFI_DEVICES:
                permission = Manifest.permission.NEARBY_WIFI_DEVICES;
                break;
            default:
                return false;
        }
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private String runtimePermissionAliasForStatus(int statusCode) {
        switch (statusCode) {
            case ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_COARSE_LOCATION:
                return "coarseLocation";
            case ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_FINE_LOCATION:
                return "fineLocation";
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_ADVERTISE:
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_CONNECT:
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_SCAN:
                return "bluetooth";
            case ConnectionsStatusCodes.MISSING_PERMISSION_NEARBY_WIFI_DEVICES:
                return "nearbyWifi";
            default:
                return null;
        }
    }

    @PermissionCallback
    private void nearbyPermissionsCallback(PluginCall call) {
        permissionRequestInFlight = false;
        if (permissionContinuationCanceled) {
            permissionContinuationCanceled = false;
            rejectCanceledStart(call, call.getMethodName());
            return;
        }
        if (requestPreciseLocationUpgradeIfNeeded(call)) {
            return;
        }
        if (requestNextMissingPermissionGroup(call)) {
            return;
        }
        List<String> deniedAliases = new ArrayList<>();
        List<String> permanentlyDeniedAliases = new ArrayList<>();
        for (String alias : requiredPermissionAliasesForCall(call)) {
            PermissionState state = getPermissionState(alias);
            if (state != PermissionState.GRANTED) {
                deniedAliases.add(alias);
                if (state == PermissionState.DENIED) {
                    permanentlyDeniedAliases.add(alias);
                }
            }
        }

        if (!deniedAliases.isEmpty()) {
            JSObject data = new JSObject();
            data.put("deniedPermissions", new JSArray(deniedAliases));
            data.put("permanentlyDeniedPermissions", new JSArray(permanentlyDeniedAliases));
            data.put("requiredPermissions", new JSArray(requiredPermissionNames()));
            boolean permanentlyDenied = !permanentlyDeniedAliases.isEmpty();
            data.put("reason", permanentlyDenied ? "permissionsPermanentlyDenied" : "permissionsDenied");
            data.put(
                "action",
                permanentlyDenied
                    ? "Android no longer shows this dialog after a permanent denial. Allow Nearby devices in the app settings."
                    : "Try again and approve the Android system prompt."
            );
            data.put("diagnostics", buildDiagnostics());
            emitState("permissionDenied", data);
            call.reject(
                permanentlyDenied
                    ? "Nearby device access was permanently denied. Open the app settings and enable the permission manually."
                    : "Nearby device access was not granted. Try again and tap Allow in the Android system dialog.",
                "PERMISSION_DENIED",
                data
            );
            return;
        }

        lastPermissionGrantElapsedRealtime = SystemClock.elapsedRealtime();
        // Build a fresh Activity-bound client after the permission UI closes.
        // This prevents Google Play Services from reusing the permission view
        // captured by the application-context client created at startup.
        refreshConnectionsClient();
        switch (call.getMethodName()) {
            case "startHost":
            case "startAdvertising":
                startAdvertisingWithPermissions(call);
                break;
            case "startDiscovery":
                startDiscoveryWithPermissions(call);
                break;
            case "requestConnection":
                requestConnectionWithPermissions(call);
                break;
            case "acceptConnection":
                acceptConnectionWithPermissions(call);
                break;
            case "requestNearbyPermissions":
                resolveNearbyPermissions(call);
                break;
            default:
                call.reject("Permission continuation is not supported for this operation.", "INVALID_OPERATION");
                break;
        }
    }

    private boolean requestPreciseLocationUpgradeIfNeeded(PluginCall call) {
        boolean locationRequired = Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2 ||
            call.getData().optBoolean(FINE_LOCATION_RECOVERY_REQUIRED, false);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !locationRequired) {
            return false;
        }
        boolean coarseGranted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED;
        boolean fineGranted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED;
        if (!coarseGranted || fineGranted || call.getData().optBoolean(PRECISE_LOCATION_UPGRADE_ATTEMPTED, false)) {
            return false;
        }

        // Android 12/12L may grant only approximate location even when both
        // permissions were requested. Request both together once more so Android
        // immediately shows its dedicated "change to precise" dialog, while the
        // original Nearby call remains pending and no intermediate error reaches JS.
        call.getData().put(PRECISE_LOCATION_UPGRADE_ATTEMPTED, true);
        permissionContinuationCanceled = false;
        permissionRequestInFlight = true;
        requestPermissionForAliases(
            new String[] { "coarseLocation", "fineLocation" },
            call,
            "nearbyPermissionsCallback"
        );
        return true;
    }

    private List<String> requiredPermissionAliasesForCall(PluginCall call) {
        List<String> aliases = requiredPermissionAliases();
        if (call.getData().optBoolean(COARSE_LOCATION_RECOVERY_REQUIRED, false) ||
            call.getData().optBoolean(FINE_LOCATION_RECOVERY_REQUIRED, false)) {
            if (!aliases.contains("coarseLocation")) {
                aliases.add("coarseLocation");
            }
        }
        if (call.getData().optBoolean(FINE_LOCATION_RECOVERY_REQUIRED, false)) {
            if (!aliases.contains("fineLocation")) aliases.add("fineLocation");
        }
        return aliases;
    }

    private void resolveNearbyPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", true);
        result.put("requiredPermissions", new JSArray(requiredPermissionNames()));
        result.put("diagnostics", buildDiagnostics());
        call.resolve(result);
    }

    private List<String> requiredPermissionAliases() {
        List<String> aliases = new ArrayList<>();
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            aliases.add("coarseLocation");
        } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
            aliases.add("coarseLocation");
            aliases.add("fineLocation");
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            aliases.add("bluetooth");
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            aliases.add("nearbyWifi");
        }
        if (Build.VERSION.SDK_INT >= ANDROID_API_17 && getContext().getApplicationInfo().targetSdkVersion >= ANDROID_API_17) {
            aliases.add("localNetwork");
        }
        return aliases;
    }

    private List<String> requiredPermissionNames() {
        List<String> permissions = new ArrayList<>();
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
            permissions.add(Manifest.permission.BLUETOOTH_SCAN);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.NEARBY_WIFI_DEVICES);
        }
        if (Build.VERSION.SDK_INT >= ANDROID_API_17 && getContext().getApplicationInfo().targetSdkVersion >= ANDROID_API_17) {
            permissions.add("android.permission.ACCESS_LOCAL_NETWORK");
        }
        return permissions;
    }

    private boolean hasAllRequiredPermissions() {
        for (String permission : requiredPermissionNames()) {
            if (ContextCompat.checkSelfPermission(getContext(), permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private boolean validateEnvironment(PluginCall call, String action) {
        int playServicesStatus = googlePlayServicesStatus();
        if (playServicesStatus != ConnectionResult.SUCCESS) {
            String reason = playServicesStatus == ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED
                ? "googlePlayServicesUpdateRequired"
                : playServicesStatus == ConnectionResult.SERVICE_DISABLED
                    ? "googlePlayServicesDisabled"
                    : "googlePlayServicesUnavailable";
            rejectEnvironment(
                call,
                action,
                reason,
                "Google Play Services is unavailable or outdated. Update or enable it and try again.",
                playServicesStatus,
                GoogleApiAvailability.getInstance().getErrorString(playServicesStatus)
            );
            return false;
        }

        Boolean bluetoothEnabled = bluetoothEnabled();
        if (bluetoothEnabled == null) {
            rejectEnvironment(
                call,
                action,
                "bluetoothUnavailable",
                "Bluetooth, which is required for Nearby Connections, is unavailable on this device.",
                ConnectionsStatusCodes.STATUS_RADIO_ERROR,
                ConnectionsStatusCodes.getStatusCodeString(ConnectionsStatusCodes.STATUS_RADIO_ERROR)
            );
            return false;
        }
        if (!bluetoothEnabled) {
            rejectEnvironment(
                call,
                action,
                "bluetoothDisabled",
                "Enable Bluetooth and try creating the local match again.",
                ConnectionsStatusCodes.STATUS_RADIO_ERROR,
                ConnectionsStatusCodes.getStatusCodeString(ConnectionsStatusCodes.STATUS_RADIO_ERROR)
            );
            return false;
        }

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2 && Boolean.FALSE.equals(locationEnabled())) {
            rejectEnvironment(
                call,
                action,
                "locationDisabled",
                "This Android version requires Location to be enabled for Nearby. Enable it and try again.",
                ConnectionsStatusCodes.MISSING_SETTING_LOCATION_MUST_BE_ON,
                ConnectionsStatusCodes.getStatusCodeString(ConnectionsStatusCodes.MISSING_SETTING_LOCATION_MUST_BE_ON)
            );
            return false;
        }
        return true;
    }

    private void rejectEnvironment(
        PluginCall call,
        String action,
        String reason,
        String userMessage,
        int statusCode,
        String statusMessage
    ) {
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("reason", reason);
        data.put("statusCode", statusCode);
        data.put("statusMessage", statusMessage);
        data.put("userMessage", userMessage);
        data.put("diagnostics", buildDiagnostics());
        emitState("error", data);
        call.reject(userMessage + " [" + statusMessage + ", " + statusCode + "]", "NEARBY_ENVIRONMENT", data);
    }

    private void rejectMissingPermissions(PluginCall call, String action) {
        List<String> missing = new ArrayList<>();
        for (String permission : requiredPermissionNames()) {
            if (ContextCompat.checkSelfPermission(getContext(), permission) != PackageManager.PERMISSION_GRANTED) {
                missing.add(permission);
            }
        }
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("reason", "permissionRevoked");
        data.put("missingPermissions", new JSArray(missing));
        data.put("diagnostics", buildDiagnostics());
        emitState("error", data);
        call.reject(
            "Nearby permission was revoked. Allow access to nearby devices in the app settings.",
            "PERMISSION_DENIED",
            data
        );
    }

    private void rejectCanceledStart(PluginCall call, String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("reason", "operationSuperseded");
        Long operationId = bridgeLong(call, "operationId");
        if (operationId != null && operationId > 0L) data.put("operationId", operationId);
        data.put("diagnostics", buildDiagnostics());
        call.reject("Nearby startup was canceled by a newer network operation.", "OPERATION_CANCELED", data);
    }

    private void rejectSupersededOperation(PluginCall call, String action, long operationId) {
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("reason", "operationSuperseded");
        data.put("operationId", operationId);
        data.put("nativeSessionGeneration", endpointSessionGeneration);
        data.put("diagnostics", buildDiagnostics());
        call.reject("Nearby operation was superseded by a newer network session.", "OPERATION_CANCELED", data);
    }

    private void rejectStaleEndpointOperation(
        PluginCall call,
        String action,
        String endpointId,
        long operationId
    ) {
        JSObject data = endpointResult(endpointId, operationId);
        data.put("action", action);
        data.put("reason", "staleOperation");
        data.put("nativeSessionGeneration", endpointSessionGeneration);
        call.reject("The endpoint belongs to another or expired network operation.", "STALE_OPERATION", data);
    }

    private void rejectOperationInProgress(PluginCall call, String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("reason", "operationInProgress");
        data.put("diagnostics", buildDiagnostics());
        call.reject("Nearby startup is already in progress.", "OPERATION_IN_PROGRESS", data);
    }

    private boolean canRetryAdvertising(int statusCode) {
        if (statusCode == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING ||
            statusCode == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) {
            return true;
        }
        return (statusCode == ConnectionsStatusCodes.STATUS_ALREADY_HAVE_ACTIVE_STRATEGY ||
            statusCode == ConnectionsStatusCodes.STATUS_OUT_OF_ORDER_API_CALL) &&
            connectedEndpointIds.isEmpty() && pendingEndpointIds.isEmpty();
    }

    private boolean canRetryDiscovery(int statusCode) {
        if (statusCode == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING ||
            statusCode == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING) {
            return true;
        }
        return (statusCode == ConnectionsStatusCodes.STATUS_ALREADY_HAVE_ACTIVE_STRATEGY ||
            statusCode == ConnectionsStatusCodes.STATUS_OUT_OF_ORDER_API_CALL) &&
            connectedEndpointIds.isEmpty() && pendingEndpointIds.isEmpty();
    }

    private long prepareAdvertisingRetry(ConnectionsClient clientAtStart, int statusCode) {
        if (statusCode == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING ||
            statusCode == ConnectionsStatusCodes.STATUS_ALREADY_HAVE_ACTIVE_STRATEGY) {
            discoveryGeneration++;
            activeDiscoveryOperationId = 0L;
            discoveryStartInFlight = false;
            discovering = false;
            clientAtStart.stopDiscovery();
        }
        clientAtStart.stopAdvertising();
        advertising = false;
        if (statusCode == ConnectionsStatusCodes.STATUS_OUT_OF_ORDER_API_CALL ||
            statusCode == ConnectionsStatusCodes.STATUS_ALREADY_HAVE_ACTIVE_STRATEGY) {
            clientAtStart.stopAllEndpoints();
            invalidateEndpointSessionState();
        }
        markTransportStopped();
        return endpointSessionGeneration;
    }

    private long prepareDiscoveryRetry(ConnectionsClient clientAtStart, int statusCode) {
        if (statusCode == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING ||
            statusCode == ConnectionsStatusCodes.STATUS_ALREADY_HAVE_ACTIVE_STRATEGY) {
            advertisingGeneration++;
            activeAdvertisingOperationId = 0L;
            advertisingStartInFlight = false;
            advertising = false;
            clientAtStart.stopAdvertising();
        }
        clientAtStart.stopDiscovery();
        discovering = false;
        if (statusCode == ConnectionsStatusCodes.STATUS_OUT_OF_ORDER_API_CALL ||
            statusCode == ConnectionsStatusCodes.STATUS_ALREADY_HAVE_ACTIVE_STRATEGY) {
            clientAtStart.stopAllEndpoints();
            invalidateEndpointSessionState();
        }
        markTransportStopped();
        return endpointSessionGeneration;
    }

    private long remainingTransportSettleDelay() {
        long now = SystemClock.elapsedRealtime();
        long transportDelay = Math.max(0L, TRANSPORT_SETTLE_MS - (now - lastTransportStopElapsedRealtime));
        long permissionDelay = Math.max(0L, PERMISSION_SETTLE_MS - (now - lastPermissionGrantElapsedRealtime));
        return Math.max(transportDelay, permissionDelay);
    }

    private void markTransportStopped() {
        lastTransportStopElapsedRealtime = SystemClock.elapsedRealtime();
    }

    private boolean isCurrentAdvertisingStart(long generation, long sessionGeneration, long operationId) {
        return generation == advertisingGeneration &&
            sessionGeneration == endpointSessionGeneration &&
            operationId > 0L &&
            operationId == latestOperationId &&
            operationId == activeAdvertisingOperationId;
    }

    private boolean isCurrentIncomingLifecycle(
        long incomingAdvertisingGeneration,
        long sessionGeneration,
        long operationId
    ) {
        return incomingAdvertisingGeneration > 0L &&
            incomingAdvertisingGeneration == advertisingGeneration &&
            sessionGeneration == endpointSessionGeneration &&
            operationId > 0L &&
            operationId == latestOperationId &&
            operationId == activeAdvertisingOperationId;
    }

    private boolean isCurrentDiscoveryStart(long generation, long sessionGeneration, long operationId) {
        return generation == discoveryGeneration &&
            sessionGeneration == endpointSessionGeneration &&
            operationId > 0L &&
            operationId == latestOperationId &&
            operationId == activeDiscoveryOperationId;
    }

    private void clearActiveAdvertisingOperation(long operationId) {
        if (activeAdvertisingOperationId == operationId) activeAdvertisingOperationId = 0L;
    }

    private void clearActiveDiscoveryOperation(long operationId) {
        if (activeDiscoveryOperationId == operationId) activeDiscoveryOperationId = 0L;
    }

    private synchronized long invalidateEndpointSessionState() {
        long generation = ++endpointSessionGeneration;
        pendingEndpointIds.clear();
        connectedEndpointIds.clear();
        endpointOwners.clear();
        endpointNames.clear();
        latestPayloadStates.clear();
        latestIncomingPayloadStates.clear();
        return generation;
    }

    private synchronized EndpointOwner claimNewEndpointOwner(
        String endpointId,
        long sessionGeneration,
        long operationId
    ) {
        if (endpointId == null || operationId <= 0L || operationId != latestOperationId ||
            sessionGeneration != endpointSessionGeneration) return null;
        EndpointOwner candidate = new EndpointOwner(
            sessionGeneration,
            operationId,
            endpointConnectionNonces.incrementAndGet()
        );
        return endpointOwners.putIfAbsent(endpointId, candidate) == null ? candidate : null;
    }

    private synchronized EndpointOwner claimIncomingEndpointOwner(
        String endpointId,
        long sessionGeneration,
        long operationId
    ) {
        if (endpointId == null || operationId <= 0L || operationId != latestOperationId ||
            sessionGeneration != endpointSessionGeneration) return null;
        while (true) {
            EndpointOwner existing = endpointOwners.get(endpointId);
            if (existing != null &&
                (pendingEndpointIds.contains(endpointId) || connectedEndpointIds.contains(endpointId))) return null;
            EndpointOwner candidate = new EndpointOwner(
                sessionGeneration,
                operationId,
                endpointConnectionNonces.incrementAndGet()
            );
            if (existing == null) {
                if (endpointOwners.putIfAbsent(endpointId, candidate) == null) return candidate;
            } else if (endpointOwners.replace(endpointId, existing, candidate)) {
                return candidate;
            }
        }
    }

    private boolean isCurrentEndpointOwner(String endpointId, long sessionGeneration, long operationId) {
        if (sessionGeneration != endpointSessionGeneration || operationId <= 0L ||
            operationId != latestOperationId) return false;
        return matchesEndpointOwner(endpointOwners.get(endpointId), sessionGeneration, operationId);
    }

    private boolean isCurrentEndpointOwner(
        String endpointId,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        EndpointOwner owner = endpointOwners.get(endpointId);
        return matchesEndpointOwner(owner, sessionGeneration, operationId) &&
            owner.connectionNonce == connectionNonce &&
            sessionGeneration == endpointSessionGeneration &&
            operationId == latestOperationId;
    }

    private boolean isCurrentEndpointOwner(String endpointId, EndpointOwner expectedOwner) {
        return expectedOwner != null &&
            expectedOwner.sessionGeneration == endpointSessionGeneration &&
            expectedOwner.operationId == latestOperationId &&
            endpointOwners.get(endpointId) == expectedOwner;
    }

    private EndpointOwner currentEndpointOwner(String endpointId, long sessionGeneration, long operationId) {
        EndpointOwner owner = endpointOwners.get(endpointId);
        return matchesEndpointOwner(owner, sessionGeneration, operationId) &&
                sessionGeneration == endpointSessionGeneration &&
                operationId == latestOperationId
            ? owner
            : null;
    }

    private boolean isCurrentEndpointOwnerOrUnclaimed(String endpointId, EndpointOwner expectedOwner) {
        if (expectedOwner == null || expectedOwner.sessionGeneration != endpointSessionGeneration ||
            expectedOwner.operationId != latestOperationId) return false;
        EndpointOwner owner = endpointOwners.get(endpointId);
        return owner == null || owner == expectedOwner;
    }

    private Map<String, EndpointOwner> captureEndpointOwners(
        List<String> endpointIds,
        long sessionGeneration,
        long operationId
    ) {
        Map<String, EndpointOwner> owners = new ConcurrentHashMap<>();
        for (String endpointId : endpointIds) {
            EndpointOwner owner = currentEndpointOwner(endpointId, sessionGeneration, operationId);
            if (owner == null) return null;
            owners.put(endpointId, owner);
        }
        return owners;
    }

    private boolean areCurrentEndpointOwners(Map<String, EndpointOwner> owners) {
        if (owners == null || owners.isEmpty()) return false;
        for (Map.Entry<String, EndpointOwner> entry : owners.entrySet()) {
            if (!isCurrentEndpointOwner(entry.getKey(), entry.getValue())) return false;
        }
        return true;
    }

    private static boolean matchesEndpointOwner(EndpointOwner owner, long sessionGeneration, long operationId) {
        return owner != null &&
            owner.sessionGeneration == sessionGeneration &&
            owner.operationId == operationId;
    }

    private void releaseEndpointOwner(String endpointId, long sessionGeneration, long operationId) {
        EndpointOwner owner = endpointOwners.get(endpointId);
        if (matchesEndpointOwner(owner, sessionGeneration, operationId)) {
            endpointOwners.remove(endpointId, owner);
        }
    }

    private void releaseEndpointOwner(String endpointId, EndpointOwner expectedOwner) {
        if (expectedOwner != null) endpointOwners.remove(endpointId, expectedOwner);
    }

    private boolean isCurrentLatestPayloadState(
        String endpointId,
        LatestPayloadState state,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        if (state == null || latestPayloadStates.get(endpointId) != state) return false;
        synchronized (state) {
            return state.sessionGeneration == sessionGeneration &&
                state.operationId == operationId &&
                state.connectionNonce == connectionNonce &&
                isCurrentEndpointOwner(endpointId, sessionGeneration, operationId, connectionNonce);
        }
    }

    private boolean isCurrentLatestPayloadAttempt(
        String endpointId,
        LatestPayloadState state,
        long payloadId,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        if (state == null || latestPayloadStates.get(endpointId) != state) return false;
        synchronized (state) {
            return isCurrentLatestPayloadAttemptLocked(
                endpointId,
                state,
                payloadId,
                sessionGeneration,
                operationId,
                connectionNonce
            );
        }
    }

    private boolean isCurrentLatestPayloadAttemptLocked(
        String endpointId,
        LatestPayloadState state,
        long payloadId,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        return latestPayloadStates.get(endpointId) == state &&
            state.sessionGeneration == sessionGeneration &&
            state.operationId == operationId &&
            state.connectionNonce == connectionNonce &&
            state.activePayloadId == payloadId &&
            isCurrentEndpointOwner(endpointId, sessionGeneration, operationId, connectionNonce);
    }

    private static String incomingPayloadKey(String endpointId, String latestKind) {
        return endpointId + "\u0000" + latestKind;
    }

    private boolean isCurrentIncomingPayloadState(
        String endpointId,
        String latestKind,
        LatestIncomingPayloadState state,
        long sessionGeneration,
        long operationId,
        long connectionNonce
    ) {
        if (state == null || latestIncomingPayloadStates.get(incomingPayloadKey(endpointId, latestKind)) != state) {
            return false;
        }
        synchronized (state) {
            return state.sessionGeneration == sessionGeneration &&
                state.operationId == operationId &&
                state.connectionNonce == connectionNonce &&
                isCurrentEndpointOwner(endpointId, sessionGeneration, operationId, connectionNonce);
        }
    }

    private long requiredOperationId(PluginCall call) {
        Long operationId = bridgeLong(call, "operationId");
        if (operationId == null || operationId <= 0L) {
            call.reject("operationId is required and must be a positive integer.", "INVALID_ARGUMENT");
            return 0L;
        }
        return operationId;
    }

    private synchronized long claimTransportOperationId(PluginCall call, String action) {
        long operationId = requiredOperationId(call);
        if (operationId == 0L) return 0L;
        if (operationId < latestOperationId) {
            rejectSupersededOperation(call, action, operationId);
            return 0L;
        }
        if (operationId > latestOperationId) {
            boolean hadEndpointState = !endpointOwners.isEmpty() ||
                !pendingEndpointIds.isEmpty() ||
                !connectedEndpointIds.isEmpty();
            // Expire owners before asking Nearby to disconnect them. Any terminal
            // callback racing with the fire-and-forget stop then observes the new
            // generation and cannot mutate a replacement connection.
            invalidateEndpointSessionState();
            latestOperationId = operationId;
            if (hadEndpointState && connectionsClient != null) {
                connectionsClient.stopAllEndpoints();
                markTransportStopped();
            }
        }
        return operationId;
    }

    private long requireCurrentTransportOperationId(PluginCall call, String action) {
        long operationId = requiredOperationId(call);
        if (operationId == 0L) return 0L;
        if (operationId != latestOperationId) {
            rejectSupersededOperation(call, action, operationId);
            return 0L;
        }
        return operationId;
    }

    private String requiredEndpointId(PluginCall call) {
        String endpointId = normalize(call.getString("endpointId"));
        if (endpointId == null) {
            call.reject("endpointId is required.", "INVALID_ARGUMENT");
        }
        return endpointId;
    }

    private boolean validateOptionalConnectionNonce(
        PluginCall call,
        String action,
        String endpointId,
        long operationId,
        EndpointOwner owner
    ) {
        Long connectionNonce = bridgeLong(call, "connectionNonce");
        if (connectionNonce == null) return true;
        if (connectionNonce <= 0L) {
            call.reject("connectionNonce must be a positive integer when provided.", "INVALID_ARGUMENT");
            return false;
        }
        if (owner != null && owner.connectionNonce == connectionNonce) return true;

        JSObject data = endpointResult(endpointId, operationId);
        data.put("action", action);
        data.put("connectionNonce", connectionNonce);
        data.put("reason", "staleConnection");
        call.reject(
            "The endpoint connection was replaced before this action could run.",
            "STALE_CONNECTION",
            data
        );
        return false;
    }

    private boolean validateRequiredConnectionNonce(
        PluginCall call,
        String action,
        String endpointId,
        long operationId,
        EndpointOwner owner
    ) {
        if (bridgeLong(call, "connectionNonce") == null) {
            call.reject("connectionNonce is required for a single-endpoint action.", "INVALID_ARGUMENT");
            return false;
        }
        return validateOptionalConnectionNonce(call, action, endpointId, operationId, owner);
    }

    /**
     * Capacitor's PluginCall#getLong only accepts values whose JSONObject
     * representation is already a java.lang.Long. Small integral values sent
     * by JavaScript (including the first connection nonces: 1, 2, 3...) are
     * represented as Integer instead, so getLong returns null even though the
     * field is present. Normalize every integral Number at our bridge boundary
     * while still rejecting strings, fractions, NaN and infinities.
     */
    private static Long bridgeLong(PluginCall call, String name) {
        return bridgeLongValue(call == null ? null : call.getData().opt(name));
    }

    static Long bridgeLongValue(Object value) {
        if (!(value instanceof Number)) return null;
        Number number = (Number) value;
        double doubleValue = number.doubleValue();
        if (!Double.isFinite(doubleValue) || doubleValue != Math.rint(doubleValue)) return null;
        if (doubleValue < Long.MIN_VALUE || doubleValue > Long.MAX_VALUE) return null;
        return number.longValue();
    }

    private String displayNameFrom(PluginCall call) {
        String displayName = normalize(call.getString("displayName"));
        if (displayName == null) {
            displayName = normalize(call.getString("endpointName"));
        }
        if (displayName == null) {
            displayName = localDisplayName;
        }
        if (displayName.length() > 64) {
            displayName = displayName.substring(0, 64);
        }
        return displayName;
    }

    private List<String> resolveSendTargets(PluginCall call, long sessionGeneration, long operationId) {
        LinkedHashSet<String> requestedTargets = new LinkedHashSet<>();
        String endpointId = normalize(call.getString("endpointId"));
        if (endpointId != null) {
            requestedTargets.add(endpointId);
        }

        JSArray endpointIds = call.getArray("endpointIds");
        if (endpointIds != null) {
            try {
                for (int index = 0; index < endpointIds.length(); index++) {
                    String item = normalize(endpointIds.getString(index));
                    if (item == null) {
                        call.reject("endpointIds must contain only non-empty strings.", "INVALID_ARGUMENT");
                        return null;
                    }
                    requestedTargets.add(item);
                }
            } catch (JSONException error) {
                call.reject("endpointIds must be an array of strings.", "INVALID_ARGUMENT", error);
                return null;
            }
        }

        if (requestedTargets.isEmpty()) {
            for (String connectedEndpointId : connectedEndpointIds) {
                if (isCurrentEndpointOwner(connectedEndpointId, sessionGeneration, operationId)) {
                    requestedTargets.add(connectedEndpointId);
                }
            }
        }

        List<String> disconnectedTargets = new ArrayList<>();
        List<String> staleTargets = new ArrayList<>();
        for (String target : requestedTargets) {
            if (!connectedEndpointIds.contains(target)) {
                disconnectedTargets.add(target);
            } else if (!isCurrentEndpointOwner(target, sessionGeneration, operationId)) {
                staleTargets.add(target);
            }
        }
        if (!disconnectedTargets.isEmpty()) {
            JSObject data = new JSObject();
            data.put("endpointIds", new JSArray(disconnectedTargets));
            call.reject("One or more target endpoints are not connected.", "ENDPOINT_NOT_CONNECTED", data);
            return null;
        }
        if (!staleTargets.isEmpty()) {
            JSObject data = new JSObject();
            data.put("endpointIds", new JSArray(staleTargets));
            data.put("operationId", operationId);
            call.reject(
                "One or more target endpoints belong to another network operation.",
                "STALE_OPERATION",
                data
            );
            return null;
        }
        return new ArrayList<>(requestedTargets);
    }

    private JSObject endpointResult(String endpointId) {
        JSObject result = new JSObject();
        result.put("endpointId", endpointId);
        String name = endpointNames.get(endpointId);
        if (name != null) {
            result.put("name", name);
        }
        return result;
    }

    private JSObject endpointResult(String endpointId, long operationId) {
        return operationResult(endpointResult(endpointId), operationId);
    }

    private JSObject endpointResult(String endpointId, EndpointOwner owner) {
        JSObject result = endpointResult(endpointId, owner == null ? 0L : owner.operationId);
        if (owner != null) result.put("connectionNonce", owner.connectionNonce);
        return result;
    }

    private JSObject operationResult(JSObject result, long operationId) {
        if (operationId > 0L) result.put("operationId", operationId);
        return result;
    }

    private JSObject baseTransportState() {
        JSObject state = new JSObject();
        state.put("serviceId", serviceId);
        state.put("strategy", STRATEGY_NAME);
        state.put("displayName", localDisplayName);
        state.put("advertising", advertising);
        state.put("advertisingStartInFlight", advertisingStartInFlight);
        state.put("discovering", discovering);
        state.put("discoveryStartInFlight", discoveryStartInFlight);
        state.put("connectedPeerCount", connectedEndpointIds.size());
        state.put("nativeSessionGeneration", endpointSessionGeneration);
        state.put("latestOperationId", latestOperationId);
        return state;
    }

    private JSObject buildDiagnostics() {
        JSObject diagnostics = new JSObject();
        diagnostics.put("sdkInt", Build.VERSION.SDK_INT);
        diagnostics.put("targetSdk", getContext().getApplicationInfo().targetSdkVersion);
        diagnostics.put("serviceId", serviceId);
        diagnostics.put("strategy", STRATEGY_NAME);
        diagnostics.put("advertising", advertising);
        diagnostics.put("advertisingStartInFlight", advertisingStartInFlight);
        diagnostics.put("discovering", discovering);
        diagnostics.put("discoveryStartInFlight", discoveryStartInFlight);
        diagnostics.put("connectedPeerCount", connectedEndpointIds.size());
        diagnostics.put("pendingPeerCount", pendingEndpointIds.size());
        diagnostics.put("nativeSessionGeneration", endpointSessionGeneration);
        diagnostics.put("latestOperationId", latestOperationId);
        diagnostics.put("activeAdvertisingOperationId", activeAdvertisingOperationId);
        diagnostics.put("activeDiscoveryOperationId", activeDiscoveryOperationId);
        diagnostics.put("ownedEndpointCount", endpointOwners.size());
        diagnostics.put("incomingRealtimePayloads", incomingRealtimePayloads.get());
        diagnostics.put("incomingRealtimeCoalesced", incomingRealtimeCoalesced.get());
        int pendingIncomingRealtimeKinds = 0;
        for (LatestIncomingPayloadState state : latestIncomingPayloadStates.values()) {
            synchronized (state) {
                if (state.bytes != null || state.flushPosted) pendingIncomingRealtimeKinds += 1;
            }
        }
        diagnostics.put("pendingIncomingRealtimeKinds", pendingIncomingRealtimeKinds);
        diagnostics.put("trackedIncomingRealtimeKinds", latestIncomingPayloadStates.size());

        int playServicesStatus = googlePlayServicesStatus();
        diagnostics.put("googlePlayServicesStatusCode", playServicesStatus);
        diagnostics.put(
            "googlePlayServicesStatusMessage",
            GoogleApiAvailability.getInstance().getErrorString(playServicesStatus)
        );
        diagnostics.put(
            "googlePlayServicesUserResolvable",
            GoogleApiAvailability.getInstance().isUserResolvableError(playServicesStatus)
        );

        BluetoothAdapter adapter = bluetoothAdapter();
        diagnostics.put("bluetoothAvailable", adapter != null);
        Boolean bluetoothEnabled = bluetoothEnabled();
        if (bluetoothEnabled != null) {
            diagnostics.put("bluetoothEnabled", bluetoothEnabled);
        }
        Boolean wifiEnabled = wifiEnabled();
        if (wifiEnabled != null) {
            diagnostics.put("wifiEnabled", wifiEnabled);
        }
        Boolean locationEnabled = locationEnabled();
        if (locationEnabled != null) {
            diagnostics.put("locationEnabled", locationEnabled);
        }

        JSObject permissionStates = new JSObject();
        for (String alias : requiredPermissionAliases()) {
            PermissionState state = getPermissionState(alias);
            permissionStates.put(alias, state == null ? "unknown" : state.toString());
        }
        diagnostics.put("permissionStates", permissionStates);

        JSObject permissionGrants = new JSObject();
        for (String permission : requiredPermissionNames()) {
            permissionGrants.put(
                permission,
                ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED
            );
        }
        diagnostics.put("permissionGrants", permissionGrants);
        return diagnostics;
    }

    private int googlePlayServicesStatus() {
        try {
            return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext());
        } catch (RuntimeException ignored) {
            return ConnectionResult.INTERNAL_ERROR;
        }
    }

    private BluetoothAdapter bluetoothAdapter() {
        try {
            BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            return manager == null ? null : manager.getAdapter();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private Boolean bluetoothEnabled() {
        BluetoothAdapter adapter = bluetoothAdapter();
        if (adapter == null) {
            return null;
        }
        try {
            return adapter.isEnabled();
        } catch (SecurityException ignored) {
            return false;
        }
    }

    private Boolean wifiEnabled() {
        try {
            WifiManager manager = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            return manager == null ? null : manager.isWifiEnabled();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private Boolean locationEnabled() {
        try {
            LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            if (manager == null) {
                return null;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return manager.isLocationEnabled();
            }
            return manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private void emitState(String eventName, JSObject data) {
        data.put("event", eventName);
        notifyListeners("state", data);
    }

    private void rejectNearbyCall(PluginCall call, String action, Exception error) {
        rejectNearbyCall(call, action, error, 0L);
    }

    private void rejectNearbyCall(PluginCall call, String action, Exception error, long operationId) {
        JSObject data = new JSObject();
        data.put("action", action);
        if (operationId > 0L) data.put("operationId", operationId);
        data.put("message", error == null ? null : error.getMessage());
        data.put("exceptionType", error == null ? "unknown" : error.getClass().getName());
        data.put("diagnostics", buildDiagnostics());

        int statusCode = apiStatusCode(error);
        String reason = nearbyStatusReason(statusCode);
        String actionSuggestion = nearbyStatusAction(statusCode);
        data.put("reason", reason);
        data.put("actionSuggestion", actionSuggestion);
        String statusMessage = statusCode == Integer.MIN_VALUE
            ? "UNKNOWN_NEARBY_ERROR"
            : ConnectionsStatusCodes.getStatusCodeString(statusCode);
        if (statusCode != Integer.MIN_VALUE) {
            data.put("statusCode", statusCode);
            data.put("statusMessage", statusMessage);
        }
        String userMessage = nearbyUserMessage(action, statusCode, statusMessage, actionSuggestion);
        data.put("userMessage", userMessage);
        emitState("error", data);
        call.reject(userMessage, "NEARBY_ERROR", error, data);
    }

    private static int apiStatusCode(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof ApiException) {
                return ((ApiException) current).getStatusCode();
            }
            current = current.getCause();
        }
        return Integer.MIN_VALUE;
    }

    static String nearbyStatusReason(int statusCode) {
        switch (statusCode) {
            case ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_COARSE_LOCATION:
            case ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_FINE_LOCATION:
            case ConnectionsStatusCodes.MISSING_PERMISSION_ACCESS_WIFI_STATE:
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH:
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_ADMIN:
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_ADVERTISE:
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_CONNECT:
            case ConnectionsStatusCodes.MISSING_PERMISSION_BLUETOOTH_SCAN:
            case ConnectionsStatusCodes.MISSING_PERMISSION_CHANGE_WIFI_STATE:
            case ConnectionsStatusCodes.MISSING_PERMISSION_NEARBY_WIFI_DEVICES:
                return "missingPermission";
            case ConnectionsStatusCodes.MISSING_SETTING_LOCATION_MUST_BE_ON:
                return "locationDisabled";
            case ConnectionsStatusCodes.STATUS_RADIO_ERROR:
                return "radioUnavailable";
            case ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING:
                return "alreadyAdvertising";
            case ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING:
                return "alreadyDiscovering";
            case ConnectionsStatusCodes.STATUS_ALREADY_HAVE_ACTIVE_STRATEGY:
                return "activeStrategyConflict";
            case ConnectionsStatusCodes.STATUS_OUT_OF_ORDER_API_CALL:
                return "outOfOrderOperation";
            case ConnectionsStatusCodes.API_CONNECTION_FAILED_ALREADY_IN_USE:
                return "nearbyInUse";
            case ConnectionResult.SERVICE_MISSING:
            case ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED:
            case ConnectionResult.SERVICE_DISABLED:
            case ConnectionResult.SERVICE_UPDATING:
                return "googlePlayServicesUnavailable";
            default:
                return "unknown";
        }
    }

    static String nearbyStatusAction(int statusCode) {
        String reason = nearbyStatusReason(statusCode);
        switch (reason) {
            case "missingPermission":
                return "Allow this app to access nearby devices and Bluetooth in system settings.";
            case "locationDisabled":
                return "Enable Location in Android quick settings and try again.";
            case "radioUnavailable":
                return "Enable Bluetooth and Wi-Fi, then try again.";
            case "alreadyAdvertising":
            case "alreadyDiscovering":
            case "activeStrategyConflict":
            case "outOfOrderOperation":
                return "Wait a moment and try again. If the error remains, leave and reopen the lobby.";
            case "nearbyInUse":
                return "Close other apps using Nearby, Bluetooth, or Wi-Fi Direct, then try again.";
            case "googlePlayServicesUnavailable":
                return "Update and enable Google Play Services, then restart the game.";
            default:
                return "Make sure Bluetooth and Wi-Fi are enabled, then try again.";
        }
    }

    static String nearbyUserMessage(String action, int statusCode, String statusMessage, String suggestion) {
        String operation = "startAdvertising".equals(action)
            ? "Could not create the local match."
            : "startDiscovery".equals(action)
                ? "Could not start searching for local matches."
                : "Nearby Connections error (" + action + ").";
        String status = statusCode == Integer.MIN_VALUE
            ? statusMessage
            : statusMessage + ", code " + statusCode;
        return operation + " " + suggestion + " [" + status + "]";
    }

    private static String payloadStatusName(int status) {
        switch (status) {
            case PayloadTransferUpdate.Status.IN_PROGRESS:
                return "inProgress";
            case PayloadTransferUpdate.Status.SUCCESS:
                return "success";
            case PayloadTransferUpdate.Status.FAILURE:
                return "failure";
            case PayloadTransferUpdate.Status.CANCELED:
                return "canceled";
            default:
                return "unknown";
        }
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static List<String> sortedCopy(Set<String> source) {
        List<String> copy = new ArrayList<>(source);
        Collections.sort(copy);
        return copy;
    }

    private synchronized void stopAllInternal() {
        if (permissionRequestInFlight) {
            permissionContinuationCanceled = true;
        }
        // Invalidate endpoint callbacks and queued looper work before invoking the
        // fire-and-forget Nearby stop APIs. Any callback racing with cleanup then
        // observes an expired native generation and becomes a no-op.
        invalidateEndpointSessionState();
        advertisingGeneration++;
        discoveryGeneration++;
        activeAdvertisingOperationId = 0L;
        activeDiscoveryOperationId = 0L;
        if (connectionsClient != null) {
            connectionsClient.stopAdvertising();
            connectionsClient.stopDiscovery();
            connectionsClient.stopAllEndpoints();
        }
        advertising = false;
        discovering = false;
        advertisingStartInFlight = false;
        discoveryStartInFlight = false;
        markTransportStopped();
    }

    @Override
    protected void handleOnDestroy() {
        stopAllInternal();
        permissionRequestInFlight = false;
        super.handleOnDestroy();
    }
}
