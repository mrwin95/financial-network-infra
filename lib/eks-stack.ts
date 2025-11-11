import { Fn, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { EksConstruct } from "./constructs/eks-construct";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { configEnvironments } from "../config/environments";
import { OidcProviderConstruct } from "./constructs/oidc-provider-construct";

interface EksStackProps extends StackProps {
  envName: keyof typeof configEnvironments;
}

export class EksStack extends Stack {
  constructor(scope: Construct, id: string, props: EksStackProps) {
    super(scope, id, props);

    const envSettings = configEnvironments[props.envName];

    const vpcId = StringParameter.valueForStringParameter(
      this,
      `/network/${props.envName}/vpc-id`
    );

    const privateSubnetIds = Fn.split(
      ",",
      StringParameter.valueForStringParameter(
        this,
        `/network/${props.envName}/private-subnet-ids`
      )
    );

    const eksCluster = new EksConstruct(this, `${props.envName}-eks-construct`, {
      envName: props.envName,
      vpcId: vpcId,
      privateSubnetIds: privateSubnetIds,
    });

    const oidc = new OidcProviderConstruct(
      this,
      `${props.envName}-oidc-construct`,
      {
        clusterName: `${props.envName}-eks-cluster`,
        envName: props.envName,
      }
    );

    oidc.node.addDependency(eksCluster);
  }
}
