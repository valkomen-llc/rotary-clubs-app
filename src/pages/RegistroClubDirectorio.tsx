// ════════════════════════════════════════════════════════════════════════════
// Registro y Actualización de Perfiles de Clubes
// Rotary, Rotaract e Interact — Rotary Distrito 4281
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { PublicFormPageLayout, PublicPageHeader, PublicFormContainer } from '../components/common/PublicInstitutionalComponents';
import { UnifiedClubForm } from '../components/directory/UnifiedClubForm';
import { useSEO } from '../hooks/useSEO';

export const RegistroClubDirectorio: React.FC = () => {
  useSEO({
    title: 'Registro y Actualización de Clubes · Directorio Distrital 4281',
    description: 'Formulario oficial para registrar o actualizar el perfil público de clubes Rotary, Rotaract e Interact del Distrito 4281.'
  });

  return (
    <PublicFormPageLayout>
      <PublicPageHeader
        badge="Rotary Distrito 4281 · Sistema Centralizado"
        title="Directorio Distrital de Clubes"
        subtitle="Registra o actualiza la identidad digital oficial de tu club Rotary, Rotaract o Interact para su publicación en el directorio distrital."
      />

      <PublicFormContainer className="py-8">
        <UnifiedClubForm />
      </PublicFormContainer>
    </PublicFormPageLayout>
  );
};

export default RegistroClubDirectorio;
