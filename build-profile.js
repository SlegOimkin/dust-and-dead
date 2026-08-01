(function (global) {
  "use strict";

  var profile = global.DustAndDeadBuildProfile;
  if (!profile || typeof profile !== "object") {
    profile = Object.freeze({
      channel: "standard",
      testAllAccess: false,
    });
    global.DustAndDeadBuildProfile = profile;
  }

  if (global.document && global.document.documentElement) {
    global.document.documentElement.setAttribute(
      "data-build-channel",
      String(profile.channel || "standard")
    );
  }
})(window);
