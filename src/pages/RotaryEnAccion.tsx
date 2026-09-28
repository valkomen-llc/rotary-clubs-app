import React from 'react';
import RotaryEnAccionForm from '../components/rotary/RotaryEnAccionForm';

const RotaryEnAccionPage: React.FC<{ campaignRef?: string }> = ({ campaignRef }) => (
  <RotaryEnAccionForm campaignRef={campaignRef} />
);
export default RotaryEnAccionPage;
