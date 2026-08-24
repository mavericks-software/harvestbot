// Which config user lists may run each subcommand of /flextime.
// Commands absent from this map are denied: granting access is an explicit act.
const commandGroups = {
  stats: ['admins'],
  report: ['admins', 'reportOnlyUsers'],
  hours: ['admins'],
};

export const commands = Object.keys(commandGroups);

export default (config) => {
  // commands.includes guard keeps inherited Object keys ('constructor') from
  // resolving to something truthy, and keeps unknown commands failing closed.
  const canRunCommand = (userId, command) => commands.includes(command)
    && commandGroups[command].some((group) => (config[group] || []).includes(userId));

  return {
    canRunCommand,
  };
};
