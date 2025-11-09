import { Fn, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { EksConstruct } from "./constructs/eks-construct";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { configEnvironments } from "../config/environments";

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

    new EksConstruct(this, `${props.envName}-eks-construct`, {
      envName: props.envName,
      vpcId: vpcId,
      privateSubnetIds: privateSubnetIds,
    });
  }
}
