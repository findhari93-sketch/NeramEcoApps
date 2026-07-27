/**
 * The one place that writes the Teams application access policy remedy.
 *
 * Why this is a shared module rather than an inline string: the remedy is
 * PowerShell that a tenant administrator runs on a completely different
 * machine, it is the single blocker standing between this codebase and any
 * Teams attendance at all, and it was previously duplicated in two routes that
 * had already drifted apart. A wrong or partial copy costs a 30 minute
 * propagation wait to disprove.
 *
 * There is no Microsoft Graph API for these policies. `Get-CsApplicationAccessPolicy`
 * and friends in the MicrosoftTeams PowerShell module are the only interface,
 * so nothing here can be checked or applied from code.
 */

const POLICY_NAME = 'Nexus-Attendance-Read';

/**
 * Build the copy-paste runbook shown against a refused app-only read.
 *
 * Three things here exist because of specific ways this has already gone wrong
 * in this tenant:
 *
 *  1. `Get-CsTenant` comes first. A policy granted in the wrong tenant looks
 *     exactly like success at the PowerShell prompt and exactly like failure in
 *     Graph, which is the most expensive way to be wrong.
 *  2. `New-` and `Grant-` are called out as both required. Creating a policy
 *     without granting it produces precisely the 403 this remedy answers, and
 *     is the likeliest explanation whenever someone reports "I already did it".
 *  3. The `Get-CsOnlineUser ... ApplicationAccessPolicy` check reads the PER-USER
 *     assignment only. After a `-Global` grant that property is blank, because
 *     blank means "inheriting the tenant default", so the check cannot tell a
 *     correct global grant from no grant at all. Granting per user as well is
 *     what makes it readable, hence the optional organizer line.
 *
 * @param organizerUpn Sign-in name of the meeting organizer, when known, so the
 *   per-user grant and its verification are concrete rather than a placeholder.
 */
export function buildAccessPolicyRemedy(organizerUpn?: string | null): string {
  const appId = process.env.AZ_CLIENT_ID || '<AZ_CLIENT_ID>';
  const tenantId = process.env.AZ_TENANT_ID || '<AZ_TENANT_ID>';
  const upn = organizerUpn || '<organizer sign-in name>';

  return [
    'Run in Windows PowerShell as a Teams administrator:',
    '',
    '  Install-Module MicrosoftTeams -Force -AllowClobber -Scope CurrentUser',
    '  Connect-MicrosoftTeams',
    '',
    '# 1. Confirm the tenant BEFORE granting. A grant in the wrong tenant',
    '#    looks like success here and like failure in Nexus.',
    '  Get-CsTenant | Select-Object DisplayName, TenantId',
    `#    TenantId must be ${tenantId}`,
    '',
    '# 2. Create the policy AND grant it. Creating without granting produces',
    '#    exactly the error you are reading right now.',
    `  New-CsApplicationAccessPolicy -Identity ${POLICY_NAME} \``,
    `    -AppIds "${appId}" \``,
    '    -Description "Nexus reads Teams meeting attendance"',
    '',
    `  Grant-CsApplicationAccessPolicy -PolicyName ${POLICY_NAME} -Global`,
    `  Grant-CsApplicationAccessPolicy -PolicyName ${POLICY_NAME} -Identity ${upn}`,
    '',
    '# 3. Verify.',
    '  Get-CsApplicationAccessPolicy',
    `  Get-CsOnlineUser -Identity ${upn} | Select-Object DisplayName, ApplicationAccessPolicy`,
    '',
    '#    Note: a -Global grant leaves ApplicationAccessPolicy BLANK, since blank',
    '#    means "inheriting the tenant default". That is why the per-user grant',
    '#    above is worth running: it is what makes this check readable.',
    '#    The authoritative check is this Why not? panel, not PowerShell.',
    '',
    'Propagation can take 30 minutes or more.',
  ].join('\n');
}

/**
 * The same remedy, prefixed for the backfill probe, where it is reported as one
 * of several closed routes rather than as the single blocking step.
 */
export function buildNoAttendanceRouteRemedy(organizerUpn?: string | null): string {
  return [
    'No route to attendance is open right now.',
    'Until one is, attendance can still be marked by hand, or imported from the',
    "Teams attendance report, on the class Attendance sheet.",
    '',
    'The app-only route needs a Teams administrator to run:',
    '',
    buildAccessPolicyRemedy(organizerUpn),
  ].join('\n');
}
