import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { configEnvironments } from "../config/environments";
import { NetworkConstruct } from "./constructs/network-construct";

interface VpcStackProps extends StackProps {
  envName: keyof typeof configEnvironments;
}

export class VpcStack extends Stack {
  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const envSettings = configEnvironments[props.envName];

    new NetworkConstruct(this, `${envSettings}-network`, {
      envName: props.envName,
      vpcCidr: envSettings.vpcCidr,
      maxAzs: envSettings.maxAzs,
      natGateways: envSettings.natGateways,
    });
  }
}
