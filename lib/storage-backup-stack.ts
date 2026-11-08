import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as efs from "aws-cdk-lib/aws-efs";
import { ValheimStorageBackupService } from "./efs-backup-service";
import * as backup from "aws-cdk-lib/aws-backup";

interface ValheimStorageBackupStackProps extends cdk.StackProps {
  efsStorage: efs.FileSystem;
}

export class ValheimStorageBackupStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ValheimStorageBackupStackProps
  ) {
    super(scope, id, props);

    new ValheimStorageBackupService(this, "ValheimStorageBackupService", {
      backupVault: backup.BackupVault.fromBackupVaultName(
        this,
        "DefaultBackupVault",
        "Default"
      ),
      efsStorage: props.efsStorage,
    });
  }
}
