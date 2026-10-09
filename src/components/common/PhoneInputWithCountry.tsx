import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, AlertTriangle, CheckCircle2, Globe } from 'lucide-react';
import { COUNTRIES, CountryInfo, DEFAULT_COUNTRY, findCountryByCode, searchCountries } from '../../lib/countryData';
import { validatePhoneClient, cleanPhoneInput, extractCountryAndNationalNumber, PhoneValidationResult } from '../../lib/phoneUtils';

interface PhoneInputWithCountryProps {
  value: string;
  onChange: (phone: string, validation: PhoneValidationResult) => void;
  defaultCountryCode?: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  showValidationHint?: boolean;
  className?: string;
}

export default function PhoneInputWithCountry({
  value,
  onChange,
  defaultCountryCode = 'CO',
  placeholder = 'Ej. 312 481 8114 o 289 659 8847',
  label,
  required = false,
  disabled = false,
  showValidationHint = true,
  className = '',
}: PhoneInputWithCountryProps) {
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(() => {
    return findCountryByCode(defaultCountryCode) || DEFAULT_COUNTRY;
  });

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nationalNumber, setNationalNumber] = useState('');
  const [validation, setValidation] = useState<PhoneValidationResult | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sincronizar estado inicial a partir del valor externo
  useEffect(() => {
    if (!value) {
      setNationalNumber('');
      setValidation(null);
      return;
    }

    const { countryCode, nationalNumber: nat, fullE164 } = extractCountryAndNationalNumber(value);
    const country = findCountryByCode(countryCode) || selectedCountry;
    setSelectedCountry(country);
    setNationalNumber(nat);

    const val = validatePhoneClient(value, country.code);
    setValidation(val);
  }, [value]);

  // Cerrar selector al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Foco en buscador al abrir dropdown
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleCountrySelect = (country: CountryInfo) => {
    setSelectedCountry(country);
    setIsOpen(false);
    setSearchQuery('');

    // Revalidar y reconstruir con nuevo país
    const digits = nationalNumber.replace(/[^0-9]/g, '');
    let candidate = '';
    if (digits) {
      // Si el número nacional ya contenía el indicativo anterior, quitarlo
      const oldDial = selectedCountry.dialCode.replace('+', '');
      let cleanNat = digits;
      if (cleanNat.startsWith(oldDial)) {
        cleanNat = cleanNat.slice(oldDial.length);
      }
      candidate = `${country.dialCode}${cleanNat}`;
    }

    const res = validatePhoneClient(candidate || country.dialCode, country.code);
    setValidation(res);
    onChange(res.e164Formatted || candidate, res);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const clean = cleanPhoneInput(raw);

    // ¿El usuario pegó o escribió un número internacional con '+'?
    if (clean.startsWith('+')) {
      const val = validatePhoneClient(clean, selectedCountry.code);
      if (val.country && val.country.code !== selectedCountry.code) {
        setSelectedCountry(val.country);
      }
      setValidation(val);
      // Extraer parte nacional
      const dialDigits = val.callingCode || '';
      let nat = val.e164;
      if (dialDigits && nat.startsWith(dialDigits)) {
        nat = nat.slice(dialDigits.length);
      }
      setNationalNumber(nat);
      onChange(val.e164Formatted || clean, val);
      return;
    }

    // El usuario escribió número nacional para el país seleccionado
    setNationalNumber(raw);
    const digits = raw.replace(/[^0-9]/g, '');
    let candidate = '';
    if (digits) {
      candidate = `${selectedCountry.dialCode}${digits}`;
    }
    const val = validatePhoneClient(candidate || raw, selectedCountry.code);
    setValidation(val);
    onChange(val.ok ? val.e164Formatted : (candidate || raw), val);
  };

  const filteredCountries = searchCountries(searchQuery);

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1">
          {required && <span className="text-red-500 mr-1">*</span>}
          {label}
        </label>
      )}

      <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-rotary-blue focus-within:border-rotary-blue transition-all">
        {/* Selector de País con Bandera e Indicativo */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200/80 rounded-l-lg text-sm text-gray-800 font-medium transition-colors border-r border-gray-200 focus:outline-none"
            title={`${selectedCountry.name} (${selectedCountry.dialCode})`}
          >
            <span className="text-lg leading-none" role="img" aria-label={selectedCountry.name}>
              {selectedCountry.flag}
            </span>
            <span className="text-xs font-bold text-gray-700 font-mono">
              {selectedCountry.dialCode}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {/* Menú desplegable flotante con buscador */}
          {isOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Buscador */}
              <div className="p-2 border-b border-gray-100 bg-gray-50/70">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar país o indicativo..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue"
                  />
                </div>
              </div>

              {/* Lista de países */}
              <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                {filteredCountries.length === 0 ? (
                  <p className="p-4 text-xs text-center text-gray-400">No se encontraron países.</p>
                ) : (
                  filteredCountries.map(c => {
                    const isSelected = c.code === selectedCountry.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handleCountrySelect(c)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
                          isSelected ? 'bg-blue-50/70 text-rotary-blue font-bold' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-base">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">({c.code})</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="font-mono text-gray-500 font-semibold">{c.dialCode}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-rotary-blue" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input numérico */}
        <input
          type="tel"
          disabled={disabled}
          value={nationalNumber}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />

        {/* Indicador visual de estado rápido en el input */}
        {validation && nationalNumber && (
          <div className="pr-3 flex items-center">
            {validation.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Número válido para WhatsApp (E.164)" />
            ) : validation.status === 'pending_review' ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" title="Requiere confirmación" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-red-400" title="Incompleto o inválido" />
            )}
          </div>
        )}
      </div>

      {/* Rótulo de ayuda / diagnóstico en tiempo real */}
      {showValidationHint && validation && nationalNumber && (
        <div className="mt-1 flex items-center justify-between text-[11px]">
          {validation.ok ? (
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>
                Válido WhatsApp: <strong className="font-mono">{validation.e164Formatted}</strong>
                {validation.country && ` (${validation.country.name})`}
              </span>
            </div>
          ) : validation.status === 'pending_review' ? (
            <div className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              <span>{validation.reason}</span>
            </div>
          ) : (
            <div className="text-red-500">
              {validation.reason || 'Verifica el número telefónico.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
