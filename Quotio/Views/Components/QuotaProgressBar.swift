//
//  QuotaProgressBar.swift
//  Quotio
//

import SwiftUI

/// Progress bar for displaying quota/usage percentage
struct QuotaProgressBar: View {
    let percent: Double
    var tint: Color = .accentColor
    var height: CGFloat = 8
    
    private var clamped: Double {
        min(100, max(0, percent))
    }
    
    var body: some View {
        GeometryReader { proxy in
            let fillWidth = proxy.size.width * clamped / 100
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.quaternary)
                Capsule()
                    .fill(tint)
                    .frame(width: fillWidth)
                    .animation(.smooth(duration: 0.3), value: clamped)
            }
        }
        .frame(height: height)
        .accessibilityLabel("Usage")
        .accessibilityValue("\(Int(clamped)) percent")
    }
}

