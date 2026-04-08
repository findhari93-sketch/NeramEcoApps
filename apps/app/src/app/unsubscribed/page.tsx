// apps/app/src/app/unsubscribed/page.tsx

export default function UnsubscribedPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      background: '#f5f5f5',
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: '#fff',
        borderRadius: '12px',
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#10003;</div>
        <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#333', margin: '0 0 12px' }}>
          You have been unsubscribed
        </h1>
        <p style={{ color: '#666', fontSize: '15px', lineHeight: '1.6', margin: '0 0 28px' }}>
          We respect your inbox. You will not receive further emails from Neram Classes about registration reminders.
        </p>
        <p style={{ color: '#999', fontSize: '13px', margin: '0 0 24px' }}>
          If you change your mind, you can always visit us at neramclasses.com.
        </p>
        <a
          href="https://app.neramclasses.com"
          style={{
            display: 'inline-block',
            background: '#1565C0',
            color: '#fff',
            padding: '12px 28px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '15px',
            fontWeight: '500',
          }}
        >
          Go to Neram Classes
        </a>
      </div>
    </div>
  );
}
