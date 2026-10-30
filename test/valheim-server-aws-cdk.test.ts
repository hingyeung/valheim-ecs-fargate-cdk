import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as ValheimServerAwsCdk from "../lib/valheim-server-aws-cdk-stack";

test("Stack creates a Fargate service that starts with zero tasks", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new ValheimServerAwsCdk.ValheimServerAwsCdkStack(
    app,
    "MyTestStack",
    {
      serverName: "test-server",
      worldName: "test-world",
      tz: "Australia/Melbourne",
      cpu: "2048",
      memory: "4096",
      valheimServerDnsNameHostedZoneName: "example.com",
      valheimServerDnsName: "valheim.example.com",
      env: { account: "123456789012", region: "ap-southeast-2" },
    }
  );
  // THEN
  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::ECS::Service", 1);
});
