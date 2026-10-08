#!/usr/bin/env node
// يطبع خطة فقط؛ لا يستدعي gcloud ولا يغيّر IAM أو الفوترة أو موارد Google.
import { pathToFileURL } from 'node:url';

const STAGING_PROJECT = /^fursan-alamn-staging(?:-[a-z0-9-]+)?$/;
const REGION_NAME = /^[a-z]+(?:-[a-z]+)+[1-9]\d*$/;
const STAGING_NETWORK_NAME = /^fursan-staging-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function stagingDeploymentPlan(env = {}) {
  const project = env.STAGING_PROJECT_ID || 'fursan-alamn-staging';
  if (!STAGING_PROJECT.test(project)) throw new Error('staging_project_required');
  const REGION = env.STAGING_REGION;
  if (!REGION || !REGION_NAME.test(REGION)) {
    throw new Error('approved_available_staging_region_required');
  }
  const network = env.STAGING_NETWORK;
  const subnet = env.STAGING_SUBNET;
  if (!STAGING_NETWORK_NAME.test(network || '') || !STAGING_NETWORK_NAME.test(subnet || '')
    || network.length > 63 || subnet.length > 63) {
    throw new Error('approved_staging_network_and_subnet_required');
  }
  const vpcArgs = `--network=${network} --subnet=${subnet} --vpc-egress=private-ranges-only`;
  const number = env.STAGING_PROJECT_NUMBER || 'STAGING_PROJECT_NUMBER';
  if (number !== 'STAGING_PROJECT_NUMBER' && !/^\d+$/.test(number)) throw new Error('invalid_project_number');
  const web = `fursan-staging-web@${project}.iam.gserviceaccount.com`;
  const bridge = `fursan-staging-bridge@${project}.iam.gserviceaccount.com`;
  const build = `fursan-staging-build@${project}.iam.gserviceaccount.com`;
  const regionalSuffix = REGION === 'me-central1' ? '' : REGION === 'me-central2' ? '-dammam' : `-${REGION}`;
  const bucket = env.STAGING_BUILD_SOURCE_BUCKET || `${project}-build-source${regionalSuffix}`;
  if (typeof bucket !== 'string' || !/^[a-z][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
    || !bucket.startsWith(`${project}-build-source`)
    || (REGION !== 'me-central1' && bucket === `${project}-build-source`)) {
    throw new Error('isolated_regional_staging_bucket_required');
  }
  const image = `${REGION}-docker.pkg.dev/${project}/fursan-staging/site:REVIEWED_COMMIT_SHA`;
  return Object.freeze({
    project, region: REGION, network, subnet, sourceBucket: bucket, image,
    identities: Object.freeze({ web, bridge, build }),
    commands: Object.freeze([
      `gcloud projects describe ${project} --format='json(projectId,projectNumber,parent)'`,
      `gcloud billing projects describe ${project} --format='json(billingAccountName,billingEnabled)'`,
      '# التالي لا ينفذ إلا بعد اعتماد المالك حساب الفوترة والهويات والأدوار ونطاق كل مورد.',
      `gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com iam.googleapis.com iamcredentials.googleapis.com iap.googleapis.com logging.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project=${project}`,
      ...['web', 'bridge', 'build'].map((role) => `gcloud iam service-accounts create fursan-staging-${role} --project=${project} --display-name='Fursan Staging ${role}'`),
      `gcloud artifacts repositories create fursan-staging --repository-format=docker --location=${REGION} --project=${project}`,
      `gcloud storage buckets create gs://${bucket} --location=${REGION} --uniform-bucket-level-access --public-access-prevention --project=${project}`,
      `gcloud artifacts repositories add-iam-policy-binding fursan-staging --location=${REGION} --project=${project} --member=serviceAccount:${build} --role=roles/artifactregistry.writer`,
      `gcloud storage buckets add-iam-policy-binding gs://${bucket} --member=serviceAccount:${build} --role=roles/storage.objectViewer`,
      `gcloud projects add-iam-policy-binding ${project} --member=serviceAccount:${build} --role=roles/logging.logWriter`,
      `gcloud projects add-iam-policy-binding ${project} --member=serviceAccount:${build} --role=roles/serviceusage.serviceUsageConsumer`,
      '# يلزم اعتماد الشبكة وSubnet منفصلاً إن لم يكونا ضمن الاعتماد الأول؛ لا تغيير لسياسة المنظمة أو استثناء لها.',
      `gcloud services enable compute.googleapis.com --project=${project}`,
      `gcloud compute networks subnets describe ${subnet} --project=${project} --region=${REGION} --format='yaml(network,ipCidrRange,privateIpGoogleAccess)'`,
      '# يتوقف النشر إن لم تكن الشبكة وSubnet المعتمدتان موجودتين في المنطقة نفسها؛ لا إنشاء افتراضي أو اختيار شبكة إنتاج بديلة.',
      '# يلزم استبدال REVIEWED_COMMIT_SHA بإصدار خضع للاختبارات، ثم فحص عدم تسرب أي ملف بيئة أو وثيقة إلى حزمة المصدر.',
      `gcloud builds submit . --project=${project} --region=${REGION} --config=cloudbuild.yaml --service-account=projects/${project}/serviceAccounts/${build} --gcs-source-staging-dir=gs://${bucket}/source --substitutions=_IMAGE_URI=${image},_SITE_ORIGIN=https://www.fapc.sa`,
      `gcloud run deploy fursan-leads-bridge-staging --project=${project} --region=${REGION} --image=${image} --service-account=${bridge} ${vpcArgs} --no-allow-unauthenticated --cpu=1 --memory=512Mi --min-instances=0 --max-instances=1 --timeout=30s --command=node --args=server/integration/receiver-index.mjs --set-env-vars=APP_ENV=staging,BRIDGE_RECEIVER_ENABLED=false,FURSAN_MASTER_SYNC=disabled`,
      `gcloud run services add-iam-policy-binding fursan-leads-bridge-staging --project=${project} --region=${REGION} --member=serviceAccount:${web} --role=roles/run.invoker`,
      `gcloud run deploy fursan-website-staging --project=${project} --region=${REGION} --image=${image} --service-account=${web} ${vpcArgs} --no-allow-unauthenticated --iap --cpu=1 --memory=512Mi --min-instances=0 --max-instances=1 --timeout=30s --set-env-vars=APP_ENV=staging,LEAD_SINK=disabled`,
      `gcloud run services add-iam-policy-binding fursan-website-staging --project=${project} --region=${REGION} --member=serviceAccount:service-${number}@gcp-sa-iap.iam.gserviceaccount.com --role=roles/run.invoker`,
      `gcloud iap web add-iam-policy-binding --project=${project} --region=${REGION} --resource-type=cloud-run --service=fursan-website-staging --member=user:APPROVED_ORGANIZATION_EMAIL --role=roles/iap.httpsResourceAccessor`,
      '# لا allUsers أو allAuthenticatedUsers أو مفاتيح JSON أو صلاحيات Sheets/SQL أو موارد إنتاج أو حذف.',
    ]),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const plan = stagingDeploymentPlan(process.env);
    console.log(`# خطة مراجعة فقط: ${plan.project} / ${plan.region}\n${plan.commands.join('\n')}`);
  } catch {
    console.error('رفض إعداد خطة لغير مشروع Staging صالح.');
    process.exitCode = 1;
  }
}
