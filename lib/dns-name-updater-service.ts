import * as core from '@aws-cdk/core'
import { Rule } from "@aws-cdk/aws-events";
import * as lambdanodejs from "@aws-cdk/aws-lambda-nodejs";
import * as lambda from "@aws-cdk/aws-lambda";
import * as targets from "@aws-cdk/aws-events-targets";
import * as logs from '@aws-cdk/aws-logs';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import { Policy, PolicyStatement, Effect } from "@aws-cdk/aws-iam"
import { HostedZone, IHostedZone } from "@aws-cdk/aws-route53"
import { Arn } from "@aws-cdk/core";

interface DnsNameUpdaterServiceProps {
  serviceArn: Arn,
  clusterArn: Arn,
  valheimServerHostedZone: IHostedZone,
  valheimServerDnsName: string
}

export class DnsNameUpdaterService extends core.Construct {
  constructor(scope: core.Construct, id: string, props: DnsNameUpdaterServiceProps) {
    super(scope, id);
    const rule = new Rule(this, "ValheimServiceReadyEventRule", {
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Service Action"],
        resources: [props.serviceArn as string],
        detail: {
          eventName: ["SERVICE_STEADY_STATE"]
        }
      }
    });

    const ecsStatusPolicy = new Policy(this, "ecsStatusPolicy", {
      statements: [
        new PolicyStatement({
          resources: ['*'],
          effect: Effect.ALLOW,
          actions: [
            "ecs:ListTasks",
            "ecs:DescribeTasks",
            "ec2:DescribeNetworkInterfaces"
          ]
        }),
        new PolicyStatement({
          resources: [props.valheimServerHostedZone.hostedZoneArn],
          effect: Effect.ALLOW,
          actions: [
            "route53:ChangeResourceRecordSets"
          ]
        })
      ]
    });

    const serviceReadyHandlerFunction = new lambdanodejs.NodejsFunction(this, "ValheimServiceReadyHandler", {
      runtime: lambda.Runtime.NODEJS_14_X, // So we can use async 
      entry: 'resources/updatedns.ts',
      handler: "handler",
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        nodeModules: ['@aws-sdk/client-ecs', '@aws-sdk/client-ec2', '@aws-sdk/client-route-53'],
      },
      environment: {
        SERVICE_ARN: props.serviceArn as string,
        CLUSTER_ARN: props.clusterArn as string,
        HOSTED_ZONE_ID: props.valheimServerHostedZone.hostedZoneId,
        DNS_NAME: props.valheimServerDnsName
      }
    });
    serviceReadyHandlerFunction.role?.attachInlinePolicy(ecsStatusPolicy)

    const notificationTopic = new sns.Topic(this, "notificationTopic")
    rule.addTarget(new targets.LambdaFunction(serviceReadyHandlerFunction));
    rule.addTarget(new targets.SnsTopic(notificationTopic));
  }
}