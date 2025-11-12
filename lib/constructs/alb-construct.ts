import { Construct } from "constructs";
import path from "path";
import fs from "fs";
import {
  FederatedPrincipal,
  ManagedPolicy,
  PolicyDocument,
  Role,
} from "aws-cdk-lib/aws-iam";
import { CfnJson, Fn, custom_resources as cr } from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
interface AlbIngressConstructProps {
  clusterName: string;
  oidcProviderArn: string;
  vpcId?: string;
  region?: string;
  namespace?: string;
  envName: string;
}

export class AlbIngressConstruct extends Construct {
  public readonly albRole: Role;
  constructor(scope: Construct, id: string, props: AlbIngressConstructProps) {
    super(scope, id);

    const {
      clusterName,
      oidcProviderArn,
      vpcId,
      namespace = "kube-system",
      region,
      envName,
    } = props;

    const policyJsonPath = path.join(
      __dirname,
      "../../policies/alb-iam-policy.json"
    );
    if (!fs.existsSync(policyJsonPath)) {
      throw new Error(
        `Missing ${policyJsonPath}. Please download from https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json`
      );
    }

    const policyDocument = JSON.parse(fs.readFileSync(policyJsonPath, "utf8"));

    const albPolicy = new ManagedPolicy(this, "AlbControllerPolicy", {
      document: PolicyDocument.fromJson(policyDocument),
      managedPolicyName: `${clusterName}-AmazonEKSLoadBalancerControllerPolicy`,
    });

    // create IAM

    const oidcUrl = Fn.select(1, Fn.split("oidc-provider/", oidcProviderArn));

    const serviceAccountName = "aws-load-balancer-controller";

    const stringEqualsJson = new CfnJson(this, "AlbControllerOidcCondition", {
      value: {
        [`${oidcUrl}:sub`]: `system:serviceaccount:${namespace}:${serviceAccountName}`,
      },
    });
    const federatedPrincipal = new FederatedPrincipal(
      oidcProviderArn,
      {
        StringEquals: stringEqualsJson,
      },
      "sts:AssumeRoleWithWebIdentity"
    );

    this.albRole = new Role(this, "AblControllerRole", {
      assumedBy: federatedPrincipal,
      description: `IRSA role for AWS Load Balancer Controller on ${clusterName}`,
      roleName: `eks-${clusterName}-alb-controller-role`,
      managedPolicies: [albPolicy],
    });

    new StringParameter(this, "AlbControllerRoleArn", {
      parameterName: `/alb/${envName}/alb-controller-role-arn`,
      stringValue: this.albRole.roleArn,
    });

    // const saManifest = {
    //   apiVersion: "v1",
    //   kind: "ServiceAccount",
    //   metadata: {
    //     name: serviceAccountName,
    //     namespace,
    //     annotations: {
    //       "eks.amazonaws.com/role-arn": albRole.roleArn,
    //     },
    //   },
    // };

    // const createSa = new cr.AwsCustomResource(this, "CreateAlbServiceAccount", {
    //   onUpdate: {
    //     service: "EKS",
    //     action: "createAddon",
    //     parameters: {
    //       addonName: "noop",
    //       clusterName,
    //     },
    //     physicalResourceId: cr.PhysicalResourceId.of(
    //       `${clusterName}-sa-${serviceAccountName}`
    //     ),
    //   },
    //   policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
    //     resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
    //   }),
    // });

    // new cr.AwsCustomResource(this, "ApplyAlbServiceAccountManifest", {
    //   onUpdate: {
    //     service: "Lambda",
    //     action: "invoke",
    //     parameters: {
    //       // You could plug in an external Lambda that calls kubectl apply
    //     },
    //     physicalResourceId: cr.PhysicalResourceId.of(
    //       `${clusterName}-apply-${serviceAccountName}`
    //     ),
    //   },
    //   policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
    //     resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
    //   }),
    // }).node.addDependency(createSa);
  }
}
