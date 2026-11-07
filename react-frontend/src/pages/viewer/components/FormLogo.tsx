interface FormLogoProps {
  url: string;
}

// Decorative: the form title right next to it already names the form.
export default function FormLogo({ url }: FormLogoProps) {
  return <img src={url} alt="" className="mb-4 h-12 w-auto max-w-full object-contain" />;
}
