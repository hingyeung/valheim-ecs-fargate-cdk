import * as cdk from "@aws-cdk/core";
import * as efs from "@aws-cdk/aws-efs";
import * as events from "@aws-cdk/aws-events";
import * as backup from "@aws-cdk/aws-backup";

interface ValheimStorageBackupServiceProps {
  efsStorage: efs.FileSystem;
  backupVault: backup.IBackupVault
}

export class ValheimStorageBackupService extends cdk.Construct {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: ValheimStorageBackupServiceProps
  ) {
    super(scope, id);

    // Create an AWS Backup plan
    const backupPlan = new backup.BackupPlan(this, "MyBackupPlan", {
      backupPlanName: "ValheimStorageBackupPlan",
      backupVault: props.backupVault,
    });

    // add backup rule to backup plan
    backupPlan.addRule(
      new backup.BackupPlanRule({
        ruleName: "ValheimEFSBackupRule",
        scheduleExpression: events.Schedule.cron({
          minute: "0",
          hour: "20",
          month: "*",
          weekDay: "FRI-SAT",
          year: "*",
        }),
        deleteAfter: cdk.Duration.days(30),
      })
    );

    // add efs filesystem to backup plan selection
    backupPlan.addSelection("ValheimEFSBackupSelection", {
      resources: [
        backup.BackupResource.fromEfsFileSystem(props.efsStorage),
      ]
    })
  }
}
