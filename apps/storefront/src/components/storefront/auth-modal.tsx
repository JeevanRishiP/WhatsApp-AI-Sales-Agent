'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useCustomer } from '@/lib/customer-context';
import { XIcon, WhatsAppIcon, LockIcon } from '@/components/icons';
import { API_BASE_URL } from '@/lib/config';

interface AuthModalProps {
  storeName: string;
}

export function CustomerAuthModal({ storeName }: AuthModalProps) {
  const { isAuthModalOpen, closeAuthModal, tenantSlug, refreshCustomer, refreshCart } = useCustomer();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const apiBase = API_BASE_URL;

  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setInterval(() => setResendCountdown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  if (!isAuthModalOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/v1/customer/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, phone }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to send verification code');
      }

      setStep('otp');
      setResendCountdown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDigitChange = (index: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto verify once 6th digit entered
    if (char && index === 5 && newDigits.every((d) => d !== '')) {
      handleVerify(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasteData) return;

    const newDigits = [...digits];
    pasteData.split('').forEach((char, i) => {
      newDigits[i] = char;
    });
    setDigits(newDigits);

    if (pasteData.length === 6) {
      handleVerify(pasteData);
    } else {
      inputRefs.current[pasteData.length]?.focus();
    }
  };

  const handleVerify = async (code: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/v1/customer/auth/verify-otp`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, phone, code }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Verification failed');
      }

      if (data.token) {
        localStorage.setItem('wcos_customer_token', data.token);
      }

      await refreshCustomer();
      await refreshCart();
      closeAuthModal();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Blurred Backdrop */}
      <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm" onClick={closeAuthModal} />

      {/* Modal Surface */}
      <div className="relative w-full max-w-md bg-stone-50 border border-neutral-200 rounded-sm p-8 shadow-2xl z-10">
        <button
          onClick={closeAuthModal}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 transition-colors"
        >
          <XIcon size={18} />
        </button>

        {/* Monogram Header */}
        <div className="text-center mb-8">
          <p className="micro-caps text-neutral-400 mb-1 tracking-widest">{storeName}</p>
          <h2 className="text-2xl font-serif font-normal text-neutral-900 tracking-tight">
            {step === 'phone' ? 'Private Client Access' : 'Security Verification'}
          </h2>
          <p className="text-xs text-neutral-500 mt-2 font-mono">
            {step === 'phone'
              ? 'Enter your WhatsApp mobile number to access your orders and private bag.'
              : `We dispatched a 6-digit access code to ${phone} via WhatsApp.`}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono rounded-xs">
            {error}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block micro-caps text-neutral-500 mb-2">WhatsApp Mobile Number</label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-white border border-neutral-300 rounded-xs font-mono text-sm text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !phone}
              className="w-full btn-luxury-primary py-3 flex items-center justify-center gap-2"
            >
              <WhatsAppIcon size={16} />
              <span>{isLoading ? 'Dispatching Code...' : 'Send WhatsApp Access Code'}</span>
            </button>

            <div className="flex items-center justify-center gap-2 pt-4 text-[11px] text-neutral-400 font-mono">
              <LockIcon size={12} />
              <span>Encrypted via Official WhatsApp Business API</span>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            {/* 6-Digit Segmented Box Inputs */}
            <div className="flex justify-between gap-2" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl font-mono bg-white border border-neutral-300 rounded-xs focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-amber-500/30 transition-all text-neutral-900"
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleVerify(digits.join(''))}
              disabled={isLoading || digits.some((d) => d === '')}
              className="w-full btn-luxury-primary py-3"
            >
              {isLoading ? 'Verifying Credentials...' : 'Verify & Enter Boutique'}
            </button>

            <div className="flex items-center justify-between text-xs font-mono pt-2">
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="text-neutral-500 hover:text-neutral-900 underline underline-offset-4"
              >
                Change Phone
              </button>
              {resendCountdown > 0 ? (
                <span className="text-neutral-400">Resend in 00:{resendCountdown.toString().padStart(2, '0')}</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  className="text-neutral-900 hover:text-amber-800 font-medium"
                >
                  Resend Code
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
