import React from 'react';
import { TabType } from '@/ui/pages/OptionsApp';
import './NavigationTab.css';

interface NavigationTabProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  { key: 'bookmarks' as TabType, label: '书签管理', icon: '📚' },
  { key: 'config' as TabType, label: '配置设置', icon: '⚙️' },
  { key: 'logs' as TabType, label: '操作日志', icon: '📋' }
];

export const NavigationTab: React.FC<NavigationTabProps> = ({
  activeTab,
  onTabChange
}) => {
  return (
    <nav className="navigation-tab">
      <div className="tab-list">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};