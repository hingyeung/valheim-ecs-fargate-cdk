import { Construct, Arn } from "@aws-cdk/core";
import * as cloudwatch from '@aws-cdk/aws-cloudwatch'
import * as lambda from "@aws-cdk/aws-lambda";
import { NodejsFunction } from "@aws-cdk/aws-lambda-nodejs";
import * as logs from '@aws-cdk/aws-logs';
import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import * as ecs from "@aws-cdk/aws-ecs";
import * as iam from '@aws-cdk/aws-iam';


export interface PlayerCounteMetricServiceProps {
  playerCountMetric: cloudwatch.Metric,
  fargateService: ecs.FargateService,
  region: string,
  serviceDNSName: string
}

export class PlayerCountMetricService extends Construct {
  constructor(scope: Construct, id: string, props: PlayerCounteMetricServiceProps) {
    super(scope, id);
    
    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });    

    const fargatePolicy = new iam.PolicyStatement({
      actions: ['ecs:DescribeServices'],
      resources: [props.fargateService.serviceArn],
    });
    const cloudWatchPolicy = new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': props.playerCountMetric.namespace,
        },
      },
    });
    lambdaRole.addToPolicy(fargatePolicy);
    lambdaRole.addToPolicy(cloudWatchPolicy);
    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));

    const playerCountMetricFunction = new NodejsFunction(this, 'PlayerCountMetricFunction', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: 'resources/emit-player-count-metric.ts',
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        nodeModules: [
          '@aws-sdk/client-ecs',
          '@aws-sdk/client-cloudwatch',
          'steam-server-query'
        ],
      },
      retryAttempts: 0,
      role: lambdaRole,
      environment: {
        SERVICE_ARN: props.fargateService.serviceArn,
        CLUSTER_ARN: props.fargateService.cluster.clusterArn,
        REGION: props.region,
        METRIC_NAMESPACE: props.playerCountMetric.namespace,
        METRIC_NAME: props.playerCountMetric.metricName,
        SERVER_DNS_NAME: props.serviceDNSName
      }
    })

    const scheduledEventRule = new events.Rule(this, "scheduledEventRule", {
      schedule: events.Schedule.cron({ minute: "0/5" }),
    });

    // trigger the function every 5 minutes
    scheduledEventRule.addTarget(new targets.LambdaFunction(playerCountMetricFunction));
    targets.addLambdaPermission(scheduledEventRule, playerCountMetricFunction)
  }
}