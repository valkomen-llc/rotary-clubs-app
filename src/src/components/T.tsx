/**
 * <T> — Translation component
 * Wraps any string and auto-translates it to the active language via Gemini.
 * Falls back to original text while translating.
 *
 * Usage:
 *   <T>Quiénes Somos</T>
 *   <T>Únete a nuestro club</T>
 */
import { useTranslated } from '../contexts/LanguageContext';

interface TProps {
    children: string;
}

export const T = ({ children }: TProps) => {
    const translated = useTranslated(children);
    return <>{translated}</>;
};

export default T;
