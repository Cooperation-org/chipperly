import Script from 'next/script';

// Microsoft Clarity, switched on by a project ID in Site settings. The ID is
// checked again here (the admin validates it too) because it is written
// into an inline script.
export function Clarity({ id }: { id?: string | null }) {
  if (!id || !/^[a-z0-9]{6,16}$/.test(id)) return null;
  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`}
    </Script>
  );
}
