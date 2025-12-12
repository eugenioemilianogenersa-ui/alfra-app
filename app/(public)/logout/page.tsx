// app/(public)/logout/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function LogoutPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    const salir = async () => {
      await supabase.auth.signOut();
      router.push('/login');
    };
    salir();
  }, [supabase, router]);

  return <p style={{ padding: 16 }}>Cerrando sesión...</p>;
}
