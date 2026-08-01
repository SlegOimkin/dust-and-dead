(function (global) {
  "use strict";

  var profile = Object.freeze({
    channel: "test-all",
    testAllAccess: true,
  });
  global.DustAndDeadBuildProfile = profile;

  if (global.document && global.document.documentElement) {
    global.document.documentElement.setAttribute("data-build-channel", profile.channel);
  }
})(window);
