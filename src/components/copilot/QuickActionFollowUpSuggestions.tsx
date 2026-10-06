import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import '../../styles/assistant-wizard.css';

interface QuickActionFollowUpSuggestionsProps {
  suggestions: string[];
  onSelectSuggestion: (suggestion: string) => void;
  disabled?: boolean;
}

export const QuickActionFollowUpSuggestions: React.FC<QuickActionFollowUpSuggestionsProps> = ({
  suggestions,
  onSelectSuggestion,
  disabled = false,
}) => {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="ezrab-suggestions-container">
      <div className="ezrab-suggestions-header">
        <Sparkles className="h-3 w-3" style={{ color: '#2563EB' }} />
        <span>Saran Langkah Lanjutan:</span>
      </div>
      <div className="ezrab-suggestions-list">
        {suggestions.slice(0, 4).map((suggestion, idx) => (
          <button
            key={idx}
            type="button"
            disabled={disabled}
            onClick={() => onSelectSuggestion(suggestion)}
            className="ezrab-suggestion-chip"
          >
            <span>{suggestion}</span>
            <ArrowRight className="h-2.5 w-2.5" style={{ color: '#2563EB', opacity: 0.8 }} />
          </button>
        ))}
      </div>
    </div>
  );
};
