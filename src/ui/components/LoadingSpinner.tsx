import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  text?: string;
  progress?: number;
  overlay?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  text = '加载中...', 
  progress,
  overlay = false 
}) => {
  const content = (
    <div className="loading-content">
      <div className="loading-spinner">
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
      </div>
      {text && <div className="loading-text">{text}</div>}
      {progress !== undefined && progress > 0 && (
        <div className="loading-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="progress-text">{Math.round(progress)}%</div>
        </div>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div className="loading-overlay">
        {content}
      </div>
    );
  }

  return content;
};