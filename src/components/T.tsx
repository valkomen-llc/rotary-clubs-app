/**
 * <T> — Translation component
 * Wraps any string and auto-translates it to the active language via Gemini.
 * Falls back to original text while translating.
 *
 * Usage:
 *   <T>Quiénes Somos</T>
 *   <T>Únete a nuestro club</T>
 */
import { useTranslated } from '../../contexts/LanguageContext';

interface TProps {
    children: string;
    className?: string;
    as?: keyof JSX.IntrinsicElements;
}

export const T = ({ children, className, as: Tag = 'span' }: TProps) => {
    const translated = useTranslated(children);
    if (className || Tag !== 'span') {
        return <Tag className={className}>{translated}</Tag>;
    }
    return <>{translated}</>;
};

export default T;
