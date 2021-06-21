import * as cloudwatch from '@aws-cdk/aws-cloudwatch'
import * as actions from "@aws-cdk/aws-cloudwatch-actions";
import * as sns from "@aws-cdk/aws-sns";
import * as subscriptions from "@aws-cdk/aws-sns-subscriptions";
import { NodejsFunction } from "@aws-cdk/aws-lambda-nodejs";
import * as lambda from "@aws-cdk/aws-lambda";
import * as logs from '@aws-cdk/aws-logs';
import { Construct, Arn } from "@aws-cdk/core";
import { Policy, PolicyStatement, Effect } from "@aws-cdk/aws-iam"

export interface NoPlayersMonitoringServiceProps {
  noPlayerMetric: cloudwatch.Metric,
  serviceArn: Arn,
  clusterArn: Arn,
  region: string
}

export class NoPlayersMonitoringService extends Construct {
  constructor(scope: Construct, id: string, props: NoPlayersMonitoringServiceProps) {
    super(scope, id);

    // alarm
    const noPlayersAlarm = new cloudwatch.Alarm(this, "NoPlayersAlarm", {
      metric: props.noPlayerMetric,
      alarmDescription: "No players connected for 60mins",
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 5,
      datapointsToAlarm: 4,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // action
    const topic = new sns.Topic(this, 'NoPlayersAlarmTopic', {
      displayName: "No Players Alarm Topic"
    });
    noPlayersAlarm.addAlarmAction(new actions.SnsAction(topic))

    const ecsStartStopPolicy = new Policy(this, "ecsStartStopPolicy", {
      statements: [
        new PolicyStatement({
          resources: [props.serviceArn as string],
          effect: Effect.ALLOW,
          actions: [ "ecs:UpdateService" ]
        })
      ]
    });

    const scaleDownFunction = new NodejsFunction(this, "scaleDownFunction", {
      runtime: lambda.Runtime.NODEJS_10_X, // So we can use async 
      entry: 'resources/scale-down-service.ts',
      handler: "handler",
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        nodeModules: ['@aws-sdk/client-ecs'],
      },
      environment: {
        SERVICE_ARN: props.serviceArn as string,
        CLUSTER_ARN: props.clusterArn as string,
        REGION: props.region
      }
    });
    scaleDownFunction.role?.attachInlinePolicy(ecsStartStopPolicy);

    topic.addSubscription(
      new subscriptions.LambdaSubscription(scaleDownFunction)
    );
  }
}