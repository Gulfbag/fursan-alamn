import{pathToFileURL}from'node:url';
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
export function activationPlan(env={}){
 const project=env.OPS_PROJECT_ID||'fursan-alamn-staging',database=env.OPS_DATABASE_ID||'fursan-operations-staging',region=env.OPS_REGION||'me-central2',service='fursan-website-staging';
 if(project!=='fursan-alamn-staging'||database!=='fursan-operations-staging'||region!=='me-central2')throw new Error('Only the approved named Staging database in Dammam is accepted');
 const number=env.STAGING_PROJECT_NUMBER||'';if(!/^\d{10,15}$/.test(number))throw new Error('A verified Staging project number is required');
 const email=env.OPS_ADMIN_EMAIL||'';if(!/^[A-Za-z0-9.!#$%&*+/?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(email))throw new Error('A separately approved IAP admin email is required');
 const digest=env.OPS_IMAGE_DIGEST||'';if(!new RegExp(`^me-central2-docker\\.pkg\\.dev/${project}/fursan-staging/website@sha256:[a-f0-9]{64}$`).test(digest))throw new Error('An immutable tested Dammam image digest is required');
 const member=`serviceAccount:fursan-staging-web@${project}.iam.gserviceaccount.com`;
 const condition=`expression=resource.name=="projects/${project}/databases/${database}",title=fursan-operations-staging-only,description=Approved_named_Staging_database_only`;
 const vars={APP_ENV:'staging',LEAD_SINK:'disabled',FURSAN_MASTER_SYNC:'disabled',OPS_ENABLED:'true',OPS_AUTH_MODE:'iap',OPS_STORE:'firestore',OPS_PROJECT_ID:project,OPS_DATABASE_ID:database,OPS_ORG_ID:'fursan',OPS_ORIGIN:`https://${service}-${number}.${region}.run.app`,OPS_IAP_AUDIENCE:`/projects/${number}/locations/${region}/services/${service}`,OPS_ROLE_BINDINGS:JSON.stringify({[email]:'admin'}),OPS_AI_ENABLED:'false'};
 return[
 '# PRINT ONLY — do not run while billing is suspended or a permission/organization-policy failure is unresolved.',
 '# No billing changes, human role grants, production, Master access, key creation, public access, Vertex activation, deletes or data migration.',
 `gcloud projects describe ${quote(project)} --format='value(projectNumber)'`,
 `gcloud billing projects describe ${quote(project)}`,
 `gcloud firestore databases describe --project=${quote(project)} --database=${quote(database)} --format=json`,
 '# STOP unless database is FIRESTORE_NATIVE/standard/me-central2 and the billing issue has been resolved by its owner.',
 '# Named database creation is a separate approved action; never silently create default or select another region.',
 `gcloud firestore databases update --project=${quote(project)} --database=${quote(database)} --delete-protection --enable-pitr`,
 `gcloud projects add-iam-policy-binding ${quote(project)} --member=${quote(member)} --role=roles/datastore.user --condition=${quote(condition)}`,
 '# Write the following known non-secret configuration to operations-env.yaml (admin identity is server-side; not a browser role).',
 '--- operations-env.yaml ---',...Object.entries(vars).map(([k,v])=>`${k}: ${JSON.stringify(v)}`),'--- end ---',
 '# Preserve existing identity/IAP/network/limits; update the existing service, no new allUsers binding.',
 `gcloud run services update ${quote(service)} --project=${quote(project)} --region=${quote(region)} --image=${quote(digest)} --env-vars-file=operations-env.yaml --max-instances=1 --timeout=30`,
 '# Acceptance via approved IAP session: config + me; synthetic CRUD/reload; receipts; version conflict; digital review; audit; anonymous/role/origin rejection; fail closed on store failure.',
 '# Test SDK/REST access restrictions using the service identity; Console database views do not enforce per-database IAM conditions.',
 '# A green /healthz or a memory-store test is not proof of Firestore write success. No recovery guarantee without a restore exercise.'
 ].join('\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(activationPlan(process.env));}catch(error){console.error(error.message);process.exitCode=1;}}
