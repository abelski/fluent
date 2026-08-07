import Tak from './Tak';

interface TakGreetingProps {
  phrase: string;
  size?: number;
  className?: string;
}

// TAK + a comic speech bubble, used as a small header accent on detail/study pages.
export default function TakGreeting({ phrase, size = 108, className }: TakGreetingProps) {
  return (
    <div className={className}>
      <div className="relative bg-white border border-gray-100 rounded-xl px-4 py-2 font-bold text-sm w-fit">
        {phrase}
        <span className="absolute left-9 -bottom-2 rotate-45 w-3.5 h-3.5 bg-white border-r border-b border-gray-100" />
      </div>
      <Tak pose="talking" size={size} className="block -mt-6" />
    </div>
  );
}
