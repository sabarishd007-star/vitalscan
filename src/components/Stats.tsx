function Stats() {
  return (
    <section className="py-16 bg-blue-50">
      <div className="grid md:grid-cols-3 gap-8 px-10">

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-4xl font-bold text-blue-600">10K+</h2>
          <p className="mt-2 text-gray-600">
            AI Health Screenings
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-4xl font-bold text-blue-600">98%</h2>
          <p className="mt-2 text-gray-600">
            Prototype Screening Accuracy
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-4xl font-bold text-blue-600">60 sec</h2>
          <p className="mt-2 text-gray-600">
            Average Scan Time
          </p>
        </div>

      </div>
    </section>
  );
}

export default Stats;