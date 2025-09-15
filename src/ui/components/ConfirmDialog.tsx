import React, { useState } from 'react';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info';
  requireConfirmText?: string; // 需要输入的确认文本
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  type = 'warning',
  requireConfirmText,
  onConfirm,
  onCancel
}) => {
  const [inputText, setInputText] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (requireConfirmText && inputText !== requireConfirmText) {
      return;
    }
    onConfirm();
    setInputText('');
  };

  const handleCancel = () => {
    onCancel();
    setInputText('');
  };

  const isConfirmDisabled = requireConfirmText && inputText !== requireConfirmText;

  const getTypeIcon = () => {
    switch (type) {
      case 'danger':
        return '⚠️';
      case 'warning':
        return '⚡';
      case 'info':
        return 'ℹ️';
      default:
        return '❓';
    }
  };

  return (
    <div className="confirm-dialog-overlay" onClick={handleCancel}>
      <div className={`confirm-dialog ${type}`} onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-icon">{getTypeIcon()}</div>
          <h3 className="dialog-title">{title}</h3>
        </div>

        <div className="dialog-content">
          <p className="dialog-message">{message}</p>

          {requireConfirmText && (
            <div className="confirm-input-group">
              <label htmlFor="confirm-input">
                请输入 <strong>{requireConfirmText}</strong> 来确认操作：
              </label>
              <input
                id="confirm-input"
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={`请输入 "${requireConfirmText}"`}
                className="confirm-input"
              />
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button
            type="button"
            onClick={handleCancel}
            className="dialog-btn dialog-btn-cancel"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`dialog-btn dialog-btn-confirm ${type}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};