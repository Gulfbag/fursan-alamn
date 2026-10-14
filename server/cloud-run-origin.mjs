const CLOUD_RUN_SUFFIX = '.run.app';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/** أصل Cloud Run قانوني فقط، بلا path أو بيانات مستخدم أو query أو fragment. */
export function canonicalCloudRunOrigin(value) {
  const raw = nonEmptyString(value);
  if (!raw) throw new TypeError('invalid_cloud_run_origin');
  let url;
  try { url = new URL(raw); } catch { throw new TypeError('invalid_cloud_run_origin'); }
  const hostname = url.hostname.toLowerCase();
  const isCloudRunHost = hostname.endsWith(CLOUD_RUN_SUFFIX) && hostname !== 'run.app';
  if (
    url.protocol !== 'https:'
    || !isCloudRunHost
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || (url.port && url.port !== '443')
  ) throw new TypeError('invalid_cloud_run_origin');
  return url.origin;
}
