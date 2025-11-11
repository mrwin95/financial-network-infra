#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/vpc-stack";
import { EksStack } from "../lib/eks-stack";

const app = new cdk.App();

const region = "ap-northeast-1"
new VpcStack(app, "DevVpcStack", {
  envName: "dev",
  env: { region },
});

new VpcStack(app, "QAVpcStack", {
  envName: "qa",
  env: { region },
});

new VpcStack(app, "ProdVpcStack", {
  envName: "prod",
  env: { region },
});

new EksStack(app, "DevEksStack", {
  envName: "dev",
  env: { region },
});
