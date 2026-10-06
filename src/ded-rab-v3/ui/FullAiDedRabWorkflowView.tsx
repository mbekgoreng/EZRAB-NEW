/**
 * EZRAB — FULL AI DED WORKFLOW VIEW (AI ESTIMATE ONLY)
 *
 * Forwards to the independent AiEstimateWorkflowView pipeline.
 * Completely decoupled from AHSP / Database / Price Resolver.
 */

import React from 'react';
import { AiEstimateWorkflowView, AiEstimateWorkflowViewProps } from '../../ai-estimate';

export type FullAiDedRabWorkflowViewProps = AiEstimateWorkflowViewProps;

export const FullAiDedRabWorkflowView: React.FC<FullAiDedRabWorkflowViewProps> = (props) => {
  return <AiEstimateWorkflowView {...props} />;
};

export default FullAiDedRabWorkflowView;
