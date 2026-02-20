"use client"
const FullScreenLoader = () => {
  return (
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-colors duration-300 bg-white`}
    >
      {/* Tailwind Spinner */}
      <div className="relative h-12 w-12">
        <div 
          className={`absolute h-full w-full rounded-full border-4 border-solid border-t-transparent animate-spin border-white`}
        />
      </div>
    </div>
  );
};

export default FullScreenLoader;