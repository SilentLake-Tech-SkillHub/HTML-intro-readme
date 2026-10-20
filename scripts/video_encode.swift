// Local macOS encoder. Called by export_video.cjs; JPEG frames use a 4-byte BE length prefix.
import Foundation
import AVFoundation
import CoreImage
import VideoToolbox

let args = CommandLine.arguments
guard args.count == 8, let width = Int(args[2]), let height = Int(args[3]),
      let fps = Int32(args[4]), let bitrate = Int(args[5]), let expected = Int64(args[7]) else {
    fatalError("Usage: encoder output width height fps bitrate prefer|require|off frames")
}
let hardware = args[6]
guard ["prefer", "require", "off"].contains(hardware) else { fatalError("Invalid hardware mode") }
let writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: args[1]), fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
    AVVideoEncoderSpecificationKey: [
        kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder as String: hardware != "off",
        kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder as String: hardware == "require"
    ],
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate,
        AVVideoExpectedSourceFrameRateKey: Int(fps),
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2]
])
input.expectsMediaDataInRealTime = false
input.mediaTimeScale = fps * 1000
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input,
    sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:]])
guard writer.canAdd(input) else { fatalError("Encoder settings unavailable") }
writer.add(input)
guard writer.startWriting() else { fatalError("Cannot start encoder: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)
let context = CIContext(options: [.useSoftwareRenderer: false])
func readExactly(_ size: Int) throws -> Data {
    var data = Data()
    while data.count < size {
        guard let part = try FileHandle.standardInput.read(upToCount: size - data.count), !part.isEmpty else { break }
        data.append(part)
    }
    return data
}
var count: Int64 = 0
while true {
    let header = try readExactly(4)
    if header.isEmpty { break }
    guard header.count == 4 else { fatalError("Truncated frame header") }
    let size = header.reduce(0) { ($0 << 8) | Int($1) }
    guard size > 0 && size < 100_000_000 else { fatalError("Invalid frame size") }
    let data = try readExactly(size)
    guard data.count == size, count < expected else { fatalError("Truncated or excess frame") }
    autoreleasepool {
        guard let image = CIImage(data: data) else { fatalError("Invalid JPEG") }
        let deadline = Date().addingTimeInterval(60)
        while !input.isReadyForMoreMediaData {
            guard writer.status != .failed, Date() < deadline else {
                fatalError("Encoder stalled: \(String(describing: writer.error))")
            }
            Thread.sleep(forTimeInterval: 0.002)
        }
        var buffer: CVPixelBuffer?
        guard let pool = adaptor.pixelBufferPool,
              CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess,
              let pixels = buffer else { fatalError("Pixel buffer allocation failed") }
        let fitted = image.transformed(by: CGAffineTransform(scaleX: CGFloat(width)/image.extent.width,
                                                            y: CGFloat(height)/image.extent.height))
        context.render(fitted, to: pixels)
        guard adaptor.append(pixels, withPresentationTime: CMTime(value: count, timescale: fps)) else {
            fatalError("Encoding failed: \(String(describing: writer.error))")
        }
        count += 1
    }
}
guard count == expected else { fatalError("Expected \(expected) frames, received \(count)") }
writer.endSession(atSourceTime: CMTime(value: count, timescale: fps))
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
guard done.wait(timeout: .now() + 120) == .success, writer.status == .completed else {
    fatalError("Finalization failed: \(String(describing: writer.error))")
}
print("Encoded \(count) frames")
