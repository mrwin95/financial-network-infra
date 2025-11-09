import { CfnOutput, Stack, Tags } from "aws-cdk-lib";
import {
  CfnEIP,
  CfnInternetGateway,
  CfnNatGateway,
  CfnRoute,
  CfnRouteTable,
  CfnSubnet,
  CfnSubnetRouteTableAssociation,
  CfnVPC,
  CfnVPCGatewayAttachment,
} from "aws-cdk-lib/aws-ec2";
import { CfnVpcEndpoint } from "aws-cdk-lib/aws-opensearchserverless";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

interface NetworkConstructProps {
  envName: string;
  vpcCidr: string;
  maxAzs: number;
  natGateways: number;
}

export class NetworkConstruct extends Construct {
  vpc: CfnVPC;
  constructor(scope: Construct, id: string, props: NetworkConstructProps) {
    super(scope, id);

    const { envName, vpcCidr, maxAzs, natGateways } = props;

    const stack = Stack.of(this);

    const vpc = new CfnVPC(this, `${envName}-vpc`, {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      cidrBlock: vpcCidr,
      tags: [{ key: "Name", value: `${envName}-vpc` }],
    });

    // internet gateway

    const igw = new CfnInternetGateway(this, `${envName}-igw`, {
      tags: [{ key: "Name", value: `${envName}-igw` }],
    });

    // attach internet gateway to vpc

    new CfnVPCGatewayAttachment(this, `${envName}-igw-attachment`, {
      vpcId: vpc.ref,
      internetGatewayId: igw.ref,
    });

    // public and private subnets

    const privateSubnets: CfnSubnet[] = [];
    const publicSubnets: CfnSubnet[] = [];

    for (let i = 0; i < maxAzs; i++) {
      const az = stack.availabilityZones[i]; // String.fromCharCode(97 + i); // 'a' = 97 in ASCII // cannot use this for 1a, 1c, 1d
      const base = i * 64;
      const publicSubnet = new CfnSubnet(this, `${envName}-public-subnet-${i}`, {
        vpcId: vpc.ref,
        cidrBlock: `10.10.${base}.0/19`,
        availabilityZone: az,
        mapPublicIpOnLaunch: true,
        tags: [{ key: "Name", value: `${envName}-public-subnet-${az}` }],
      });

      publicSubnets.push(publicSubnet);

      const privateSubnet = new CfnSubnet(
        this,
        `${envName}-private-subnet-${i}`,
        {
          vpcId: vpc.ref,
          cidrBlock: `10.10.${base + 32}.0/20`,
          availabilityZone: az,
          mapPublicIpOnLaunch: false,
          tags: [{ key: "Name", value: `${envName}-private-subnet-${az}` }],
        }
      );

      privateSubnets.push(privateSubnet);
    }

    // Create single public route

    const publicRouteTable = new CfnRouteTable(this, `${envName}-public-rt`, {
      vpcId: vpc.ref,
      tags: [{ key: "Name", value: `${envName}-public-rt` }],
    });

    // public route table to IGW

    new CfnRoute(this, `${envName}-public-route`, {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: igw.ref,
    });

    // associate public subnets with public route table

    publicSubnets.forEach((subnet, idx) => {
      new CfnSubnetRouteTableAssociation(
        this,
        `${envName}-public-rt-assoc-${idx}`,
        {
          subnetId: subnet.ref,
          routeTableId: publicRouteTable.ref,
        }
      );
    });

    // Nat gateway one per subnet for HA

    const natGatewayRefs: string[] = [];

    privateSubnets.forEach((subnet, idx) => {
      const eip = new CfnEIP(this, `${envName}-nat-eip-${idx}`, {
        domain: "vpc",
        tags: [{ key: "Name", value: `${envName}-nat-eip-${idx}` }],
      });

      const natGw = new CfnNatGateway(this, `${envName}-nat-gw-${idx}`, {
        allocationId: eip.attrAllocationId,
        subnetId: publicSubnets[idx].ref,
        tags: [{ key: "Name", value: `${envName}-nat-gw-${idx}` }],
      });

      natGatewayRefs.push(natGw.ref);
    });

    // create route table per nat

    privateSubnets.forEach((subnet, idx) => {
      const privateRouteTable = new CfnRouteTable(
        this,
        `${envName}-private-rt-${idx}`,
        {
          vpcId: vpc.ref,
          tags: [{ key: "Name", value: `${envName}-private-rt-${idx}` }],
        }
      );

      // private route

      new CfnRoute(this, `${envName}-private-route-${idx}`, {
        routeTableId: privateRouteTable.ref,
        destinationCidrBlock: "0.0.0.0/0",
        natGatewayId: natGatewayRefs[idx],
      });

      // attach nat gateway to private route
      new CfnSubnetRouteTableAssociation(
        this,
        `${envName}-private-rt-assoc-${idx}`,
        {
          subnetId: subnet.ref,
          routeTableId: privateRouteTable.ref,
        }
      );
    });

    // Add Vpc Endpoints if needed
    new CfnVpcEndpoint(this, `${envName}-s3-endpoint`, {
      vpcId: vpc.ref,
      name: `${envName}-s3-endpoint`,
      subnetIds: privateSubnets.map((subnet) => subnet.ref),
    });

    // Create DynamoDB Gateway Endpoint (optional)
    // new CfnVpcEndpoint(this, `${envName}-dynamodb-endpoint`, {
    //   name: `${envName}-dynamodb-endpoint`,
    //   vpcId: vpc.ref,
    //   subnetIds: privateSubnets.map((subnet) => subnet.ref),
    // });

    // add DynamoDB VPC endpoint if needed

    Tags.of(vpc).add("Name", `${envName}-vpc`);
    Tags.of(vpc).add("Environment", envName);
    this.vpc = vpc;

    new CfnOutput(this, `${envName}-VpcId`, {
      value: vpc.ref,
    });

    new StringParameter(this, `${envName}-vpc-id-ssm`, {
      parameterName: `/network/${envName}/vpc-id`,
      stringValue: vpc.ref,
    });

    new StringParameter(this, `${envName}-private-subnets`, {
      parameterName: `/network/${envName}/private-subnet-ids`,
      stringValue: privateSubnets.map((subnet) => subnet.ref).join(","),
    });

    new StringParameter(this, `${envName}-public-subnets`, {
      parameterName: `/network/${envName}/public-subnet-ids`,
      stringValue: publicSubnets.map((subnet) => subnet.ref).join(","),
    });
  }
}
