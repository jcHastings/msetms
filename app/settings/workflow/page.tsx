import { PageHeader } from "@/components/page-header";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { WorkflowEngine } from "@/components/workflow-engine";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getWorkflowSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function WorkflowSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const workflow = getWorkflowSettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <div className="settings-page">
        <SettingsBack />
        <PageHeader title="Automated Workflow" dense />
        <div className="workflow-heads-up mb-4">
          <strong>Heads up!</strong> These rules change live loads without another click. Assign blocks cannot be
          overridden. Tell the desk before you turn them on.
        </div>
        <WorkflowEngine settings={workflow} canEdit={canEdit} />
      </div>
    </SettingsAdminGate>
  );
}
