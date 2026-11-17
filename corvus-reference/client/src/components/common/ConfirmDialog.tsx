import React from 'react';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      closeOnBackdrop
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-text-primary whitespace-pre-wrap">{message}</div>
    </Modal>
  );
}
