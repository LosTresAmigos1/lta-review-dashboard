export default function Card({ className = '', hover = false, children, ...props }) {
  return (
    <div
      className={`card ${hover ? 'card-hover' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
