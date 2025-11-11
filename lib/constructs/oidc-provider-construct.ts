import { CfnOutput, custom_resources as cr } from "aws-cdk-lib";
import { OpenIdConnectProvider } from "aws-cdk-lib/aws-iam";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

interface OidcProviderConstructProps {
  clusterName: string;
  region?: string;
  envName: string;
}

export class OidcProviderConstruct extends Construct {
  private oidcProvider: OpenIdConnectProvider;

  constructor(scope: Construct, key: string, props: OidcProviderConstructProps) {
    super(scope, key);

    const { clusterName, region, envName } = props;

    const describeCluster = new cr.AwsCustomResource(
      this,
      `DescribeClusterOidc`,
      {
        onUpdate: {
          service: "EKS",
          action: "describeCluster",
          parameters: {
            name: clusterName,
          },
          region,
          physicalResourceId: cr.PhysicalResourceId.of(
            `${clusterName}-describe`
          ),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    const issuerUrl = describeCluster.getResponseField(
      "cluster.identity.oidc.issuer"
    );

    this.oidcProvider = new OpenIdConnectProvider(this, "EksOidcProvider", {
      url: issuerUrl,
      clientIds: ["sts.amazonaws.com"],
      thumbprints: ["9e99a48a9960b14926bb7f3b02e22da0ecd0c5f6"],
    });

    this.oidcProvider.node.addDependency(describeCluster);

    new CfnOutput(this, "OidcUrl", {
      value: issuerUrl,
      exportName: `${clusterName}-OidcUrl`,
    });

    new CfnOutput(this, "OidcArn", {
      value: this.oidcProvider.openIdConnectProviderArn,
      exportName: `${clusterName}-OidcArn`,
    });

    new StringParameter(this, `${envName}-oidc-url`, {
      parameterName: `/oidc/${envName}/oidc-url`,
      stringValue: issuerUrl,
    });

    new StringParameter(this, `${envName}-oidc-arn`, {
      parameterName: `/oidc/${envName}/oidc-arn`,
      stringValue: this.oidcProvider.openIdConnectProviderArn,
    });
  }
}
