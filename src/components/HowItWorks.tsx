function HowItWorks() {
  return (
    <section className="py-20 bg-gray-50">

      <h2 className="text-4xl font-bold text-center text-blue-700">
        How VitalScan Works
      </h2>

      <p className="text-center mt-4 text-gray-600">
        Complete your health screening in just 3 simple steps.
      </p>

      <div className="grid md:grid-cols-3 gap-8 px-10 mt-12">

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl">📷</div>

          <h3 className="mt-5 text-2xl font-bold">
            Scan Your Face
          </h3>

          <p className="mt-4 text-gray-600">
            Use your webcam to capture your face for AI-assisted analysis.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl">🤖</div>

          <h3 className="mt-5 text-2xl font-bold">
            AI Analysis
          </h3>

          <p className="mt-4 text-gray-600">
            Our prototype analyzes the provided information to estimate health risks.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl">📊</div>

          <h3 className="mt-5 text-2xl font-bold">
            Get Your Report
          </h3>

          <p className="mt-4 text-gray-600">
            View your health score, trends, and recommendations instantly.
          </p>
        </div>

      </div>

    </section>
  );
}

export default HowItWorks;