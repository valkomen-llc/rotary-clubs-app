import React from 'react';
import ProgramIntakeForm from '../components/programas/intake/ProgramIntakeForm';

// Formulario institucional de programas (v4.1286): los líderes de los
// programas que respalda el distrito envían la información de sus páginas.
// Dirección: dominio.org/formulario-programas (?programa=<slug>).
const FormularioProgramasPage: React.FC = () => <ProgramIntakeForm />;
export default FormularioProgramasPage;
