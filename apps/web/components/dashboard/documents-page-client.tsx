"use client";

import { useState } from "react";
import { flushSync } from "react-dom";

import { DashboardPageFrame } from "@/components/dashboard/dashboard-page-frame";
import { DocumentPanel } from "@/components/dashboard/document-panel";
import { KnowledgeBasePanel } from "@/components/dashboard/knowledge-base-panel";
import { useDocumentControls } from "@/components/dashboard/use-document-controls";
import { useKnowledgeBaseControls } from "@/components/dashboard/use-knowledge-base-controls";

export function DocumentsPageClient() {
  const [error, setError] = useState<string | null>(null);
  const kb = useKnowledgeBaseControls({ setError });
  const docs = useDocumentControls({
    selectedKbId: kb.selectedKbId,
    refreshKbs: kb.refreshKbs,
    setError,
  });

  return (
    <DashboardPageFrame kbCount={kb.kbs.length} docCount={docs.docs.length} error={error}>
      <div className="grid flex-1 gap-4 lg:grid-cols-[0.9fr_1fr]">
        <KnowledgeBasePanel
          kbs={kb.kbs}
          selectedKb={kb.selectedKb}
          selectedKbId={kb.selectedKbId}
          kbName={kb.kbName}
          kbDesc={kb.kbDesc}
          busy={kb.busy}
          deleteKbConfirmId={kb.deleteKbConfirmId}
          deleteKbConfirmName={kb.deleteKbConfirmName}
          onKbNameChange={kb.setKbName}
          onKbDescChange={kb.setKbDesc}
          onSelectKb={(nextKbId) => {
            if (nextKbId !== kb.selectedKbId) {
              flushSync(() => {
                docs.beginKbSwitch(nextKbId);
              });
            }
            kb.setSelectedKbId(nextKbId);
          }}
          onCreateKb={kb.onCreateKb}
          onRequestDeleteKb={kb.onRequestDeleteKb}
          onDeleteKb={() => void kb.onDeleteKb()}
          onCancelDeleteKb={kb.onCancelDeleteKb}
          onDeleteKbConfirmNameChange={kb.setDeleteKbConfirmName}
        />

        <DocumentPanel
          docs={docs.docs}
          selectedKb={kb.selectedKb}
          selectedKbId={kb.selectedKbId}
          selectedDocId={docs.selectedDocId}
          docPreview={docs.docPreview}
          docChunks={docs.docChunks}
          detailLoading={docs.detailLoading}
          detailLayout="side"
          uploadQueue={docs.uploadQueue}
          processingCount={docs.processingCount}
          busy={docs.busy}
          loading={docs.loading}
          onUpload={(files) => void docs.onUpload(files)}
          onInspectDoc={(doc) => void docs.onInspectDoc(doc)}
          onReindexDoc={(doc) => void docs.onReindexDoc(doc)}
          onDeleteDoc={(docId) => void docs.onDeleteDoc(docId)}
          onLoadMorePreview={(docId) => void docs.onLoadMorePreview(docId)}
        />
      </div>
    </DashboardPageFrame>
  );
}
