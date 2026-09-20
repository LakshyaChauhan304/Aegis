import { DescribeClustersCommand, DescribeServicesCommand, DescribeTaskDefinitionCommand, ECSClient } from "@aws-sdk/client-ecs";
import { DescribeImagesCommand, DescribeRepositoriesCommand, ECRClient } from "@aws-sdk/client-ecr";
import { DescribeLoadBalancersCommand, DescribeTargetGroupsCommand, DescribeTargetHealthCommand, ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectLockConfigurationCommand, GetBucketVersioningCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { GetPolicyStoreCommand, VerifiedPermissionsClient } from "@aws-sdk/client-verifiedpermissions";

const region = process.env.AWS_REGION || "ap-southeast-2";
const ecs = new ECSClient({ region });
const ecr = new ECRClient({ region });
const elb = new ElasticLoadBalancingV2Client({ region });
const dynamo = new DynamoDBClient({ region });
const s3 = new S3Client({ region });
const avp = new VerifiedPermissionsClient({ region });

const clusterName = process.env.AEGIS_ECS_CLUSTER || "aegis-cluster";
const serviceName = process.env.AEGIS_ECS_SERVICE || "aegis-service";
const repositoryName = process.env.AEGIS_ECR_REPOSITORY || "aegis";
const albName = process.env.AEGIS_ALB_NAME || "aegis-alb";
const tableName = process.env.AEGIS_DYNAMODB_TABLE || "AegisEvidence";
const bucketName = process.env.AEGIS_S3_BUCKET || "aegis-evidence-643220021031-ap-southeast-2";
const policyStoreId = process.env.AVP_POLICY_STORE_ID || "4VKzAMGEYyBg3ZkcpULube";

type ServiceStatus = { name: string; role: string; state: string; note: string; details?: any };

async function readEcs(): Promise<ServiceStatus> {
  const clusters = await ecs.send(new DescribeClustersCommand({ clusters: [clusterName] }));
  const cluster = clusters.clusters?.[0];
  if (!cluster) throw new Error("ECS cluster not found");
  const services = await ecs.send(new DescribeServicesCommand({ cluster: clusterName, services: [serviceName] }));
  const service = services.services?.[0];
  if (!service) throw new Error("ECS service not found");
  const taskDefinitionArn = service.taskDefinition;
  const taskDefinition = taskDefinitionArn ? await ecs.send(new DescribeTaskDefinitionCommand({ taskDefinition: taskDefinitionArn })) : null;
  const container = taskDefinition?.taskDefinition?.containerDefinitions?.[0];
  return {
    name: "Amazon ECS",
    role: "Aegis backend runtime",
    state: service.runningCount === service.desiredCount && service.pendingCount === 0 ? "LIVE_VERIFIED" : "PARTIAL",
    note: `Cluster ${clusterName}; service ${serviceName}; ${service.runningCount || 0}/${service.desiredCount || 0} tasks running.`,
    details: {
      cluster: clusterName,
      service: serviceName,
      desired: service.desiredCount || 0,
      running: service.runningCount || 0,
      pending: service.pendingCount || 0,
      deployment: service.deployments?.[0]?.rolloutState || service.deployments?.[0]?.status || "NOT AVAILABLE",
      taskDefinition: taskDefinitionArn || "NOT AVAILABLE",
      image: container?.image || "NOT AVAILABLE",
    },
  };
}

async function readEcr(): Promise<ServiceStatus> {
  const repository = await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [repositoryName] }));
  const repo = repository.repositories?.[0];
  if (!repo) throw new Error("ECR repository not found");
  const images = await ecr.send(new DescribeImagesCommand({ repositoryName: repositoryName, filter: { tagStatus: "TAGGED" } }));
  const latest = [...(images.imageDetails || [])].sort((a, b) => Number(b.imagePushedAt || 0) - Number(a.imagePushedAt || 0))[0];
  return {
    name: "Amazon ECR",
    role: "Backend container image registry",
    state: latest ? "LIVE_VERIFIED" : "PARTIAL",
    note: latest ? `Latest tagged image ${latest.imageTags?.join(", ") || "NOT TAGGED"}.` : "Repository is present but no tagged image was returned.",
    details: {
      repository: repo.repositoryUri || repositoryName,
      imageTag: latest?.imageTags?.[0] || "NOT AVAILABLE",
      digest: latest?.imageDigest || "NOT AVAILABLE",
      pushedAt: latest?.imagePushedAt?.toISOString?.() || "NOT AVAILABLE",
    },
  };
}

async function readAlb(): Promise<ServiceStatus> {
  const loadBalancers = await elb.send(new DescribeLoadBalancersCommand({ Names: [albName] }));
  const loadBalancer = loadBalancers.LoadBalancers?.[0];
  if (!loadBalancer?.LoadBalancerArn) throw new Error("ALB not found");
  const groups = await elb.send(new DescribeTargetGroupsCommand({ LoadBalancerArn: loadBalancer.LoadBalancerArn }));
  const targetGroup = groups.TargetGroups?.[0];
  const health = targetGroup?.TargetGroupArn
    ? await elb.send(new DescribeTargetHealthCommand({ TargetGroupArn: targetGroup.TargetGroupArn }))
    : null;
  const healthy = (health?.TargetHealthDescriptions || []).filter((target) => target.TargetHealth?.State === "healthy").length;
  return {
    name: "Application Load Balancer",
    role: "Existing Aegis ingress",
    state: loadBalancer.State?.Code === "active" && healthy > 0 ? "LIVE_VERIFIED" : "PARTIAL",
    note: `${loadBalancer.DNSName || albName}; ${healthy} healthy target(s).`,
    details: { name: albName, dnsName: loadBalancer.DNSName, state: loadBalancer.State?.Code, healthyTargets: healthy, targetGroup: targetGroup?.TargetGroupArn || "NOT AVAILABLE" },
  };
}

async function readDynamo(): Promise<ServiceStatus> {
  const table = await dynamo.send(new DescribeTableCommand({ TableName: tableName }));
  return {
    name: "Amazon DynamoDB",
    role: "Persistent evidence history",
    state: table.Table?.TableStatus === "ACTIVE" ? "LIVE_VERIFIED" : "PARTIAL",
    note: `${table.Table?.ItemCount ?? 0} approximate items in ${tableName}.`,
    details: { table: tableName, status: table.Table?.TableStatus, itemCount: table.Table?.ItemCount ?? 0, arn: table.Table?.TableArn },
  };
}

async function readS3(): Promise<ServiceStatus> {
  const [versioning, lock, objects] = await Promise.all([
    s3.send(new GetBucketVersioningCommand({ Bucket: bucketName })),
    s3.send(new GetObjectLockConfigurationCommand({ Bucket: bucketName })),
    s3.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: "evidence/", MaxKeys: 1 })),
  ]);
  const locked = (lock as any).ObjectLockConfiguration?.ObjectLockEnabled === "Enabled";
  return {
    name: "Amazon S3 Object Lock",
    role: "Tamper-resistant evidence archive",
    state: versioning.Status === "Enabled" && locked ? "LIVE_VERIFIED" : "PARTIAL",
    note: `Bucket ${bucketName}; versioning ${versioning.Status || "NOT CONFIGURED"}; Object Lock ${locked ? "enabled" : "not enabled"}.`,
    details: { bucket: bucketName, versioning: versioning.Status || "NOT CONFIGURED", objectLock: locked ? "Enabled" : "NOT CONFIGURED", evidenceObjectPresent: (objects.KeyCount || 0) > 0 },
  };
}

async function readAvp(): Promise<ServiceStatus> {
  const store = await avp.send(new GetPolicyStoreCommand({ policyStoreId }));
  return {
    name: "Amazon Verified Permissions",
    role: "Remote authorization provider",
    state: store.policyStoreId ? "LIVE_VERIFIED" : "PARTIAL",
    note: `Policy store ${policyStoreId} is queryable from the backend role.`,
    details: { policyStoreId, status: (store as any).status || "NOT RETURNED BY API", createdDate: store.createdDate?.toISOString?.() || "NOT AVAILABLE" },
  };
}

export async function getAwsResourceStatus() {
  const readers = await Promise.allSettled([readEcs(), readEcr(), readAlb(), readDynamo(), readS3(), readAvp()]);
  const aws = readers.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const names = ["Amazon ECS", "Amazon ECR", "Application Load Balancer", "Amazon DynamoDB", "Amazon S3 Object Lock", "Amazon Verified Permissions"];
    return { name: names[index], role: "AWS control-plane read", state: "UNAVAILABLE", note: result.reason?.name === "AccessDeniedException" ? "AWS_ACCESS_DENIED" : "AWS_READ_UNAVAILABLE" };
  });
  return { source: aws.some((item) => item.state === "UNAVAILABLE") ? "PARTIAL" : "LIVE_VERIFIED", aws };
}
