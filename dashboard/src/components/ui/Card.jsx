export default function Card({ className = '', children, ...props }) {
  return (
    <div className={`bg-white border border-stone-200 rounded-xl ${className}`} {...props}>
      {children}
    </div>
  )
}
