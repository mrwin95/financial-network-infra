import { CfnSecurityGroup, CfnSecurityGroupIngress } from "aws-cdk-lib/aws-ec2";
import { CfnRole } from "aws-cdk-lib/aws-iam";
import { CfnAddon, CfnCluster, CfnNodegroup } from "aws-cdk-lib/aws-eks";
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
      resourcesVpcConfig: {
        subnetIds: privateSubnetIds,
        securityGroupIds: [planeSecurityGroup.ref],
        endpointPrivateAccess: true,
        endpointPublicAccess: false,
      },
      //   kubernetesNetworkConfig: {
      //     serviceIpv4Cidr: "10.10.0.0/16",
      //   },
      version: eksVersion || "1.32",
      tags: [{ key: "Name", value: `${envName}-eks-cluster` }],
    });

    // create node group

    const nodeGroup = new CfnNodegroup(this, `${envName}-eks-node-group`, {
      clusterName: cluster.ref,
      nodeRole: nodeRole.attrArn,
      subnets: privateSubnetIds,
      scalingConfig: {
        desiredSize: 2,
        maxSize: 3,
        minSize: 2,
      },
      instanceTypes: ["t3.medium"],
      amiType: "AL2023_X86_64_STANDARD",
      diskSize: 20,
      tags: { Environment: envName },
    });

    nodeGroup.addDependency(cluster);

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
      addonVersion: "v1.31.10-eksbuild.12",
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

    vpcCniAddon.addDependency(cluster);
    corednsAddon.addDependency(cluster);
    kubeProxyAddon.addDependency(cluster);
    ebsCsiAddon.addDependency(cluster);
    podIdentityAddon.addDependency(cluster);

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
