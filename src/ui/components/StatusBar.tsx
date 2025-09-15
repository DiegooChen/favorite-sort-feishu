import React from 'react';

interface StatusBarProps {
  totalBookmarks: number;
  selectedCount: number;
  lastUpdate: Date;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  totalBookmarks,
  selectedCount,
  lastUpdate
}) => {
  return (
    <div className="status-bar">
      <div className="status-item">
        总计: {totalBookmarks} 个书签
      </div>
      {selectedCount > 0 && (
        <div className="status-item">
          已选择: {selectedCount} 个
        </div>
      )}
      <div className="status-item">
        最后更新: {lastUpdate.toLocaleTimeString()}
      </div>
    </div>
  );
};