import { CfnSecurityGroup, CfnSecurityGroupIngress } from "aws-cdk-lib/aws-ec2";
import {
  AccountPrincipal,
  CfnOIDCProvider,
  CfnRole,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  CfnAccessEntry,
  CfnAddon,
  CfnCluster,
  CfnNodegroup,
  CfnPodIdentityAssociation,
} from "aws-cdk-lib/aws-eks";
import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";

interface EksConstructProps {
  envName: string;
  vpcId: string;
  privateSubnetIds: string[];
  //   publicSubnetIds?: string[];
  eksVersion?: string;
}

export class EksConstruct extends Construct {
  constructor(scope: Construct, id: string, props: EksConstructProps) {
    super(scope, id);

    const { envName, vpcId, privateSubnetIds, eksVersion } = props;

    // create plane security group
    const planeSecurityGroup = new CfnSecurityGroup(
      this,
      `${envName}-eks-plane-sg`,
      {
        groupName: `${envName}-eks-plane-sg`,
        groupDescription: `${envName} Eks Plane Security Group`,
        vpcId,
        tags: [{ key: "Name", value: `${envName}-eks-plane-sg` }],
      }
    );

    // Node security group
    const nodeSecurityGroup = new CfnSecurityGroup(
      this,
      `${envName}-eks-node-sg`,
      {
        groupName: `${envName}-eks-node-sg`,
        groupDescription: `${envName} Eks Node Security Group`,
        vpcId,
        tags: [{ key: "Name", value: `${envName}-eks-node-sg` }],
      }
    );

    // allow node to communicate with node
    new CfnSecurityGroupIngress(this, `${envName}-node-to-node`, {
      groupId: nodeSecurityGroup.ref,
      sourceSecurityGroupId: planeSecurityGroup.ref,
      fromPort: 443,
      toPort: 443,
      ipProtocol: "tcp",
      description: "Allow node-to-node traffic",
    });

    // allow plane to communicate with plane

    new CfnSecurityGroupIngress(this, `${envName}-plane-to-node`, {
      groupId: planeSecurityGroup.ref,
      sourceSecurityGroupId: planeSecurityGroup.ref,
      ipProtocol: "-1",
      description: "Allow plane-to-node traffic",
    });

    // create IAM role for eks plane

    const eksRole = new CfnRole(this, `${envName}-eks-role`, {
      roleName: `${envName}-eks-role`,
      assumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "eks.amazonaws.com",
            },
            Action: "sts:AssumeRole",
          },
        ],
      },
      managedPolicyArns: [
        "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
        "arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
      ],
      tags: [{ key: "Name", value: `${envName}-eks-role` }],
    });

    // create IAM role for eks node group

    const nodeRole = new CfnRole(this, `${envName}-eks-node-role`, {
      roleName: `${envName}-eks-node-role`,
      assumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "ec2.amazonaws.com",
            },
            Action: "sts:AssumeRole",
          },
        ],
      },
      managedPolicyArns: [
        "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
        "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
        "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
      ],
      tags: [{ key: "Name", value: `${envName}-eks-node-role` }],
    });

    //create eks cluster

    const cluster = new CfnCluster(this, `${envName}-eks-cluster`, {
      name: `${envName}-eks-cluster`,
      roleArn: eksRole.attrArn,
      accessConfig: {
        authenticationMode: "API_AND_CONFIG_MAP",
        bootstrapClusterCreatorAdminPermissions: true,
      },
      resourcesVpcConfig: {
        subnetIds: privateSubnetIds,
        securityGroupIds: [planeSecurityGroup.ref],
        endpointPrivateAccess: true,
        endpointPublicAccess: false,
      },
      //   kubernetesNetworkConfig: {
      //     serviceIpv4Cidr: "10.10.0.0/16",
      //   },
      version: eksVersion || "1.34",
      tags: [{ key: "Name", value: `${envName}-eks-cluster` }],
    });

    // cluster.deletionProtection = true;

    // const oidcIssuer = Fn.select(
    //   1,
    //   Fn.split("https://", cluster.attrOpenIdConnectIssuerUrl)
    // );

    // const oidcProvider = new CfnOIDCProvider(this, `${envName}-eks-oidc`, {
    //   url: oidcIssuer,
    //   clientIdList: ["sts.amazonaws.com"],
    //   thumbprintList: ["9e99a48a9960b14926bb7f3b02e22da0afd10df6"],
    // });

    // oidcProvider.addDependency(cluster);

    // const appPodRole = new Role(this, `${envName}-eks-app-pod-role`, {
    //   roleName: `${envName}-eks-app-pod-role`,
    //   assumedBy: new ServicePrincipal("pods.eks.amazonaws.com"), // ✅ No OIDC
    //   description: "IAM Role for Pods using EKS Pod Identity",
    //   managedPolicies: [
    //     ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"),
    //   ],
    // });

    // Link kuberte SA to IAM role
    // const association = new CfnPodIdentityAssociation(
    //   this,
    //   `${envName}-eks-pod-identity`,
    //   {
    //     clusterName: cluster.ref!,
    //     roleArn: appPodRole.roleArn,
    //     // namespace and service account name can be anything, just an example
    //     namespace: "default",
    //     serviceAccount: "my-app-sa",
    //   }
    // );

    // association.addDependency(cluster);

    const amiType =
      eksVersion && parseFloat(eksVersion) >= 1.33
        ? "AL2023_X86_64_STANDARD"
        : "AL2_x86_64";
    // create node group

    const nodeGroup = new CfnNodegroup(this, `${envName}-eks-node-group`, {
      nodegroupName: `${envName}-eks-node-group`,
      version: eksVersion || "1.32",
      clusterName: cluster.ref,
      nodeRole: nodeRole.attrArn,
      subnets: privateSubnetIds,
      scalingConfig: {
        desiredSize: 2,
        maxSize: 3,
        minSize: 2,
      },
      instanceTypes: ["t3.medium"],
      amiType,
      diskSize: 20,
      tags: { Environment: envName },
    });

    nodeGroup.addDependency(cluster);

    const devOpsRole = new Role(this, `${envName}-devops-role`, {
      roleName: `${envName}-devops-role`,
      assumedBy: new AccountPrincipal(cluster.stack.account),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSClusterPolicy"),
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSServicePolicy"),
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy"),
      ],
      description:
        "Allows DevOps engineers to access the EKS cluster via AccessEntry",
    });
    const accessEntry = new CfnAccessEntry(
      this,
      `${envName}-devops-access-entry`,
      {
        clusterName: cluster.attrId, // not cluster.ref
        principalArn: devOpsRole.roleArn,
        type: "STANDARD",
      }
    );

    accessEntry.addDependency(cluster);

    const podIdentity = new CfnPodIdentityAssociation(
      this,
      "EmailServicePodIdentity",
      {
        clusterName: cluster.attrId, // use actual name
        roleArn: "arn:aws:iam::792248914698:role/EmailServicePodRole",
        namespace: "default",
        serviceAccount: "email-service-sa",
      }
    );

    // Ensure it runs after cluster is ready
    podIdentity.addDependency(cluster);

    // policy association dependency on cluster

    // new CfnPodIdentityAssociation(this, "EmailServicePodIdentity", {
    //   clusterName: cluster.ref,
    //   roleArn: "arn:aws:iam::792248914698:role/EmailServicePodRole",
    //   namespace: "default",
    //   serviceAccount: "email-service-sa",
    // });

    //Core EKS addons

    const vpcCniAddon = new CfnAddon(this, `${envName}-vpc-cni-addon`, {
      addonName: "vpc-cni",
      clusterName: cluster.ref,
      addonVersion: "v1.20.4-eksbuild.2",
      resolveConflicts: "OVERWRITE",
    });

    const corednsAddon = new CfnAddon(this, `${envName}-core-dns-addon`, {
      addonName: "coredns",
      clusterName: cluster.ref,
      addonVersion: "v1.11.4-eksbuild.24",
      resolveConflicts: "OVERWRITE",
    });

    const kubeProxyAddon = new CfnAddon(this, `${envName}-kube-proxy-addon`, {
      addonName: "kube-proxy",
      clusterName: cluster.ref,
      addonVersion: "v1.32.6-eksbuild.12",
      resolveConflicts: "OVERWRITE",
    });

    const ebsCsiAddon = new CfnAddon(this, `${envName}-ebs-csi-addon`, {
      addonName: "aws-ebs-csi-driver",
      clusterName: cluster.ref,
      resolveConflicts: "OVERWRITE",
    });

    const podIdentityAddon = new CfnAddon(
      this,
      `${envName}-pod-identity-addon`,
      {
        addonName: "eks-pod-identity-agent",
        clusterName: cluster.ref,
        resolveConflicts: "OVERWRITE",
      }
    );

    // association.addDependency(podIdentityAddon);
    vpcCniAddon.addDependency(cluster);
    corednsAddon.addDependency(cluster);
    kubeProxyAddon.addDependency(cluster);
    ebsCsiAddon.addDependency(cluster);
    // podIdentityAddon.addDependency(cluster);

    new CfnOutput(this, `${envName}-eks-cluster-name`, { value: cluster.ref });
    new CfnOutput(this, `${envName}-eks-node-group-name`, {
      value: nodeGroup.ref,
    });
    new CfnOutput(this, `${envName}-eks-plane-sg-id`, {
      value: planeSecurityGroup.ref,
    });
    new CfnOutput(this, `${envName}-eks-node-sg-id`, {
      value: nodeSecurityGroup.ref,
    });
  }
}
