import { Link } from "react-router-dom";

function Hero() {
  return (
    <section className="flex flex-col items-center justify-center text-center py-24 bg-gradient-to-r from-cyan-50 to-blue-100">
      <h1 className="text-6xl font-extrabold text-blue-700">
        Scan Your Health in 60 Seconds
      </h1>

      <p className="mt-6 text-xl text-gray-700 max-w-2xl">
        AI-powered health screening that helps identify potential health risks
        quickly and encourages timely medical consultation.
      </p>

      <Link
        to="/scan"
        className="mt-10 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 inline-block"
      >
        Start Free Scan
      </Link>
    </section>
  );
}

export default Hero;