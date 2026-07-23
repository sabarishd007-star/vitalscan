function Features() {
  return (
    <section className="py-20 bg-white">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-blue-700">
          Why Choose VitalScan?
        </h2>

        <p className="mt-4 text-gray-600">
          Smart AI-powered health screening in under 60 seconds.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 px-10 mt-12">

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-blue-600">
            ❤️ Heart Rate
          </h3>

          <p className="mt-4 text-gray-600">
            Estimate heart rate using AI-assisted facial analysis.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-blue-600">
            🩸 Health Score
          </h3>

          <p className="mt-4 text-gray-600">
            Get an overall health score based on your health information.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-blue-600">
            📊 Dashboard
          </h3>

          <p className="mt-4 text-gray-600">
            View your health trends, reports, and recommendations.
          </p>
        </div>

      </div>
    </section>
  );
}

export default Features;