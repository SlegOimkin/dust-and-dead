package com.testproject.dustanddead;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.Test;

public class NearbyConnectionsPluginTest {
    @Test
    public void realtimePayloadKindRecognizesOnlyCumulativeLatestOnlyMessages() {
        assertEquals(
            "snapshot",
            NearbyConnectionsPlugin.realtimePayloadKind(
                "{\"type\":\"snapshot\",\"sequence\":9001}".getBytes(StandardCharsets.UTF_8)
            )
        );
        assertEquals(
            "input",
            NearbyConnectionsPlugin.realtimePayloadKind(
                "{\"type\":\"input\",\"sequence\":42,\"snapshotAck\":9001}".getBytes(StandardCharsets.UTF_8)
            )
        );
        assertNull(
            NearbyConnectionsPlugin.realtimePayloadKind(
                "{\"type\":\"decision\",\"action\":\"fire\"}".getBytes(StandardCharsets.UTF_8)
            )
        );
        assertNull(
            NearbyConnectionsPlugin.realtimePayloadKind(
                "{\"type\":\"matchEnd\"}".getBytes(StandardCharsets.UTF_8)
            )
        );
    }

    @Test
    public void latestOnlyCoalescingIsConstantTimeForCompressedBinaryPayloads() {
        byte[] activeCompressed = new byte[] { 'D', '9', 'G', 'Z', 31, -117, 8, 0 };
        byte[] newestCompressed = new byte[] { 'D', '9', 'G', 'Z', 31, -117, 8, 1 };

        assertSame(
            newestCompressed,
            NearbyConnectionsPlugin.coalesceLatestPayloadBytes(activeCompressed, newestCompressed)
        );
        assertSame(
            activeCompressed,
            NearbyConnectionsPlugin.coalesceLatestPayloadBytes(activeCompressed, null)
        );
    }

    @Test
    public void bridgeLongAcceptsSmallIntegerConnectionNonces() {
        // org.json deliberately stores small JavaScript integers as Integer,
        // while Capacitor PluginCall#getLong accepts Long only. This is the
        // value shape used by connection nonces immediately after pairing.
        assertEquals(Long.valueOf(1L), NearbyConnectionsPlugin.bridgeLongValue(Integer.valueOf(1)));
        assertEquals(Long.valueOf(42L), NearbyConnectionsPlugin.bridgeLongValue(Long.valueOf(42L)));
        assertEquals(Long.valueOf(7L), NearbyConnectionsPlugin.bridgeLongValue(Double.valueOf(7.0)));
    }

    @Test
    public void bridgeLongRejectsMissingOrNonIntegralValues() {
        assertNull(NearbyConnectionsPlugin.bridgeLongValue(null));
        assertNull(NearbyConnectionsPlugin.bridgeLongValue("1"));
        assertNull(NearbyConnectionsPlugin.bridgeLongValue(Double.valueOf(1.5)));
        assertNull(NearbyConnectionsPlugin.bridgeLongValue(Double.valueOf(Double.NaN)));
        assertNull(NearbyConnectionsPlugin.bridgeLongValue(Double.valueOf(Double.POSITIVE_INFINITY)));
    }

    @Test
    public void incomingLifecycleGateQuarantinesReversePendingResults() {
        NearbyConnectionsPlugin.IncomingLifecycleGate gate =
            new NearbyConnectionsPlugin.IncomingLifecycleGate();

        NearbyConnectionsPlugin.IncomingLifecycleGate.InitiationDecision first = gate.onInitiated("same-endpoint");
        NearbyConnectionsPlugin.IncomingLifecycleGate.InitiationDecision overlap = gate.onInitiated("same-endpoint");

        assertTrue(first.accepted);
        assertFalse(overlap.accepted);
        assertTrue(overlap.quarantineStarted);

        // The newer OK may arrive before the older rejection. Neither ambiguous
        // result may be applied to an owner; a successful result is disconnected.
        NearbyConnectionsPlugin.IncomingLifecycleGate.ResultDecision newerSuccess =
            gate.onConnectionResult("same-endpoint", true);
        NearbyConnectionsPlugin.IncomingLifecycleGate.ResultDecision olderRejection =
            gate.onConnectionResult("same-endpoint", false);

        assertFalse(newerSuccess.applyToOwner);
        assertTrue(newerSuccess.disconnectSuccessfulAttempt);
        assertFalse(olderRejection.applyToOwner);
        assertFalse(olderRejection.quarantineDrained);

        NearbyConnectionsPlugin.IncomingLifecycleGate.DisconnectDecision disconnected =
            gate.onDisconnected("same-endpoint");
        assertFalse(disconnected.applyToOwner);
        assertTrue(disconnected.quarantineDrained);
        assertFalse(gate.isQuarantined("same-endpoint"));
        assertTrue(gate.onInitiated("same-endpoint").accepted);
    }

    @Test
    public void incomingLifecycleGateDrainsConnectedOverlapInEitherTerminalOrder() {
        NearbyConnectionsPlugin.IncomingLifecycleGate gate =
            new NearbyConnectionsPlugin.IncomingLifecycleGate();

        assertTrue(gate.onInitiated("same-endpoint").accepted);
        assertTrue(gate.onConnectionResult("same-endpoint", true).applyToOwner);
        assertFalse(gate.onInitiated("same-endpoint").accepted);

        // The old disconnect may race ahead of the rejected overlapping result.
        NearbyConnectionsPlugin.IncomingLifecycleGate.DisconnectDecision oldDisconnect =
            gate.onDisconnected("same-endpoint");
        assertFalse(oldDisconnect.applyToOwner);
        assertFalse(oldDisconnect.quarantineDrained);

        NearbyConnectionsPlugin.IncomingLifecycleGate.ResultDecision overlapRejected =
            gate.onConnectionResult("same-endpoint", false);
        assertFalse(overlapRejected.applyToOwner);
        assertTrue(overlapRejected.quarantineDrained);
        assertFalse(gate.isQuarantined("same-endpoint"));
        assertTrue(gate.onInitiated("same-endpoint").accepted);

        NearbyConnectionsPlugin.IncomingLifecycleGate reverseGate =
            new NearbyConnectionsPlugin.IncomingLifecycleGate();
        assertTrue(reverseGate.onInitiated("reverse-endpoint").accepted);
        assertTrue(reverseGate.onConnectionResult("reverse-endpoint", true).applyToOwner);
        assertFalse(reverseGate.onInitiated("reverse-endpoint").accepted);

        NearbyConnectionsPlugin.IncomingLifecycleGate.ResultDecision rejectedFirst =
            reverseGate.onConnectionResult("reverse-endpoint", false);
        assertFalse(rejectedFirst.applyToOwner);
        assertFalse(rejectedFirst.quarantineDrained);

        NearbyConnectionsPlugin.IncomingLifecycleGate.DisconnectDecision disconnectedLast =
            reverseGate.onDisconnected("reverse-endpoint");
        assertFalse(disconnectedLast.applyToOwner);
        assertTrue(disconnectedLast.quarantineDrained);
        assertFalse(reverseGate.isQuarantined("reverse-endpoint"));
        assertTrue(reverseGate.onInitiated("reverse-endpoint").accepted);
    }
}
