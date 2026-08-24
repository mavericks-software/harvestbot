// Which config user lists may run each subcommand of /flextime.
// Commands absent from this map are denied: granting access is an explicit act.
const commandGroups = {
  stats: ['admins'],
  report: ['admins', 'reportOnlyUsers'],
  hours: ['admins'],
};

export const commands = Object.freeze(Object.keys(commandGroups));

// Every config key the map reads, so a test can assert the real config still
// has them. A renamed list would otherwise lock everyone out silently.
export const groups = Object.freeze([...new Set(Object.values(commandGroups).flat())]);

export default (config) => {
  // Denies rather than throws on anything unexpected. The commands guard also
  // stops inherited Object keys ('constructor') resolving to something truthy.
  // The Array.isArray check matters because a list written as a comma string,
  // the style used elsewhere in baseConfig, would make includes() a substring
  // match and quietly authorise any id contained in it.
  const canRunCommand = (userId, command) => Boolean(userId)
    && commands.includes(command)
    && commandGroups[command].some((group) => {
      const allowed = config[group];
      return Array.isArray(allowed) && allowed.includes(userId);
    });

  return {
    canRunCommand,
  };
};
